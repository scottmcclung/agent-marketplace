#!/usr/bin/env bash
# Runs the trigger eval in trigger-evals.json with skill-creator's run_eval,
# which checks whether Claude's first tool call picks this skill.
#
# run_eval's default setup skews results here in three ways, so this wrapper
# changes them:
#  - run_eval adds a temporary copy of the skill under a random name and only
#    counts picks of that copy. Any other copy of the skill would compete with
#    it, so the devtools plugin is switched off for these sessions, and a
#    personal copy in ~/.claude/skills stops the run.
#  - Each parallel worker adds its own temporary copy, so a session can see
#    several identical skills. Runs here are serial.
#  - run_eval writes its temporary copy into the nearest .claude/commands above
#    its working directory, which from most folders is ~/.claude. It runs from
#    an empty temporary folder instead, and that folder's .claude holds the
#    settings that switch the plugin off.
#
# The skill text comes from this repository's Claude build, so run
# `npm run build` after editing SKILL.md.hbs.
#
# run_eval only sees the first tool call, so it can't see a skill used partway
# through a task. Bug fixes, where a debugging skill usually goes first, are
# covered by run-session-tests.sh.
#
# Usage: run-trigger-evals.sh [results.json]
#   SET=all|train|holdout   which queries; holdout entries are marked "holdout": true
#   DESCRIPTION_FILE=path   test a candidate description instead of the built one
#   RUNS=3                  runs per query
#   LIMIT=n                 only the first n queries of the set
#   MODEL=claude-opus-5-5   model for the sessions
set -euo pipefail

SKILL=principle-make-the-change-easy
EVALS="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$EVALS/../../../.." && pwd)"
BUILT="$REPO/dist/claude/skills/$SKILL/SKILL.md"
SET="${SET:-all}"
RUNS="${RUNS:-3}"
MODEL="${MODEL:-claude-opus-5-5}"
OUT="${1:-${TMPDIR:-/tmp}/${SKILL}-trigger-$(date +%Y%m%d-%H%M%S).json}"

SC="$(ls -d "$HOME"/.claude/skills/skill-creator "$HOME"/.claude/skills/synced/*/skill-creator 2>/dev/null | head -1 || true)"
if [[ -z "$SC" || ! -f "$SC/scripts/run_eval.py" ]]; then
  echo "skill-creator's scripts/run_eval.py was not found under ~/.claude/skills" >&2
  exit 1
fi
if [[ ! -f "$BUILT" ]]; then
  echo "$BUILT is missing. Run npm run build in $REPO first." >&2
  exit 1
fi
if [[ -e "$HOME/.claude/skills/$SKILL" ]]; then
  echo "A personal copy at ~/.claude/skills/$SKILL competes with the copy under test. Remove it and use the devtools plugin copy." >&2
  exit 1
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/${SKILL}-trigger.XXXXXX")"
mkdir -p "$work/root/.claude" "$work/skill/$SKILL"
# The claude.ai synced devtools plugin loads whenever the local one is off,
# so both are switched off.
echo '{"enabledPlugins": {"devtools@agent-marketplace": false, "devtools@synced": false}}' \
  > "$work/root/.claude/settings.local.json"

case "$SET" in
  all)     filter='.' ;;
  train)   filter='map(select(.holdout != true))' ;;
  holdout) filter='map(select(.holdout == true))' ;;
  *) echo "SET must be all, train, or holdout" >&2; exit 1 ;;
esac
jq "$filter | if env.LIMIT then .[0:(env.LIMIT | tonumber)] else . end" \
  "$EVALS/trigger-evals.json" > "$work/queries.json"

# run_eval reads the skill name and description from --skill-path.
cp "$BUILT" "$work/skill/$SKILL/SKILL.md"
desc_args=()
if [[ -n "${DESCRIPTION_FILE:-}" ]]; then
  desc_args=(--description "$(cat "$DESCRIPTION_FILE")")
fi

echo "Running $(jq length "$work/queries.json") queries x $RUNS runs. Results: $OUT" >&2
(cd "$work/root" && PYTHONPATH="$SC" python3 -m scripts.run_eval \
  --eval-set "$work/queries.json" \
  --skill-path "$work/skill/$SKILL" \
  ${desc_args[@]+"${desc_args[@]}"} \
  --model "$MODEL" --num-workers 1 --timeout 60 --runs-per-query "$RUNS" \
  --verbose > "$OUT")
