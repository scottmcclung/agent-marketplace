#!/usr/bin/env bash
# Runs each session case in this folder (a case folder with prompt.md and
# files/) as a full Claude session on a fresh copy of its files, then reports
# whether the skill was used and whether that happened before the first edit
# to a file being fixed.
#
# Sessions load this repository's Claude build as the devtools plugin, so run
# `npm run build` after editing SKILL.md.hbs. Installed devtools copies are
# switched off for these sessions so only the build is seen. A personal copy in
# ~/.claude/skills would be seen too, so it stops the run. The skill is never
# copied into the workspace: Claude lists the files there, finds SKILL.md, and
# reads it as a project file, which no longer tests whether the description
# triggers.
#
# Usage: run-session-tests.sh [output-dir]
#   RUNS=3                 runs per case
#   MODEL=claude-opus-5-5  model for the sessions
#   CASE='*'               glob to pick cases by folder name
set -euo pipefail

SKILL=principle-make-the-change-easy
EVALS="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="$(cd "$EVALS/../../../.." && pwd)/dist/claude"
RUNS="${RUNS:-3}"
MODEL="${MODEL:-claude-opus-5-5}"
CASE="${CASE:-*}"
OUT="${1:-$(mktemp -d "${TMPDIR:-/tmp}/${SKILL}-sessions.XXXXXX")}"

if [[ ! -f "$PLUGIN/skills/$SKILL/SKILL.md" ]]; then
  echo "$PLUGIN/skills/$SKILL/SKILL.md is missing. Run npm run build in the repository first." >&2
  exit 1
fi
if [[ -e "$HOME/.claude/skills/$SKILL" ]]; then
  echo "A personal copy at ~/.claude/skills/$SKILL competes with the copy under test. Remove it and use the devtools plugin copy." >&2
  exit 1
fi
mkdir -p "$OUT"
echo "Transcripts: $OUT"

for case_dir in "$EVALS"/$CASE/; do
  [[ -f "$case_dir/prompt.md" && -d "$case_dir/files" ]] || continue
  name="$(basename "$case_dir")"
  # The prompt is everything after the settings block in prompt.md.
  prompt="$(awk '/^---[[:space:]]*$/ && n < 2 { n++; next } n >= 2' "$case_dir/prompt.md" | sed '/./,$!d')"
  # Files being fixed: the case's input files that aren't tests. Helper files
  # Claude creates and edits to test files don't count as the fix.
  targets="$(cd "$case_dir/files" && find . -type f -exec basename {} \; \
    | grep -vE '(^test_|_test\.)' | jq -R . | jq -sc .)"
  used=0; ordered=0

  for r in $(seq 1 "$RUNS"); do
    work="$(mktemp -d "${TMPDIR:-/tmp}/${name}.XXXXXX")"
    cp -R "$case_dir/files/." "$work/"
    log="$OUT/$name-$r.jsonl"
    (cd "$work" && env -u CLAUDECODE claude -p "$prompt" \
      --model "$MODEL" \
      --plugin-dir "$PLUGIN" \
      --settings '{"enabledPlugins": {"devtools@agent-marketplace": false, "devtools@synced": false}}' \
      --output-format stream-json --verbose \
      --permission-mode acceptEdits \
      --allowedTools "Bash(python3:*)" "Bash(go:*)" "Bash(ls:*)" "Bash(find:*)" "Bash(cat:*)" "Bash(grep:*)" \
      --max-turns 40 < /dev/null 2>/dev/null | grep '^{' > "$log") || true
    rm -rf "$work"

    result="$(jq -rs --arg skill "$SKILL" --argjson targets "$targets" '
      [.[] | select(.type == "assistant") | .message.content[] | select(.type == "tool_use")] as $calls
      | ([range(0; $calls | length)
          | select($calls[.].name == "Skill"
                   and (($calls[.].input.skill // "") | test("(^|:)" + $skill + "$")))] | first) as $s
      | ([range(0; $calls | length)
          | select(($calls[.].name | IN("Edit", "Write", "MultiEdit"))
                   and ((($calls[.].input.file_path // "") | split("/") | last) as $b
                        | $targets | index($b)) != null)] | first) as $e
      | [ (if $s == null then "no" else "yes" end),
          (if $s == null then "no"
           elif $e == null then "no-fix-edit"
           elif $s < $e then "yes" else "no" end) ]
      | @tsv' "$log")"
    skill_used="${result%%$'\t'*}"; before_edit="${result#*$'\t'}"
    [[ "$skill_used" == yes ]] && used=$((used + 1))
    [[ "$before_edit" == yes ]] && ordered=$((ordered + 1))
    printf '%-45s skill used: %-3s  before first fix edit: %s\n' "$name-$r" "$skill_used" "$before_edit"
  done
  printf '%-45s skill used %d/%d, before first fix edit %d/%d\n\n' "$name" "$used" "$RUNS" "$ordered" "$RUNS"
done
