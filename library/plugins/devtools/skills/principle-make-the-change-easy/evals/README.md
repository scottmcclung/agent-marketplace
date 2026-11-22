# Evals for principle-make-the-change-easy

There are two kinds of tests here. They answer different questions, so a change to the description should be checked with both.

## What's here

| Path | What it tests |
|---|---|
| `trigger-evals.json` | Does the description make Claude pick the skill as its first move? 27 queries, each labeled `should_trigger`. |
| `bugfix-invoice-double-discount/` | A full bug-fix session on real code. Is the skill used, and is it used before the fix? |
| `bugfix-config-env-parsing-with-cleanup/` | The same, for a bug fix where the user invites cleanup. |
| `run-trigger-evals.sh` | Runs the trigger queries. |
| `run-session-tests.sh` | Runs the bug-fix sessions. |

The trigger test only sees Claude's first tool call. On a bug fix, Claude usually loads a debugging skill first, so the trigger test scores those as misses even when this skill gets used a moment later. That's why the bug-fix cases are full sessions instead of trigger queries. The two bug-fix queries are still in `trigger-evals.json`, and they are expected to fail there.

## How to run

This folder stays in the library. The build leaves every skill's `evals/` folder out of the Claude, Codex, and Pi packages, so none of this ships to users.

All three ways of running these tests use the owning Claude plugin build, not the copy in `library/`. Devtools uses `dist/claude/devtools`; sfdc uses `dist/claude/sfdc`. Both scripts resolve the owner from their source directory. Run `npm run build` from the repository root after editing `SKILL.md.hbs`.

Both scripts default to `claude-opus-5-5`. Set `MODEL` to match the model you actually use. Both stop if a personal copy of the skill is installed at `~/.claude/skills/principle-make-the-change-easy`, because Claude would see it next to the copy under test. Both switch off installed and claude.ai-synced devtools and sfdc copies for their own sessions only, so neither plugin's other copy competes with the skill under test.

**Trigger queries** (about 25 minutes for all 27 at 3 runs each):

```bash
./run-trigger-evals.sh results.json
SET=holdout ./run-trigger-evals.sh                       # held-out queries only
DESCRIPTION_FILE=candidate.txt ./run-trigger-evals.sh    # try a description before changing SKILL.md.hbs
```

**Bug-fix sessions** (about 6 minutes for 2 cases at 3 runs each):

```bash
./run-session-tests.sh
RUNS=1 CASE='bugfix-config*' ./run-session-tests.sh      # quick check
```

The sessions load the owning build with `--plugin-dir`, so the skill is offered as `devtools:principle-make-the-change-easy` or `sfdc:principle-make-the-change-easy`. Don't copy the skill into the session's working folder. Claude lists the files there, finds `SKILL.md`, and reads it as a project file, so the test stops measuring the description.

**With `claude plugin eval`.** The case folders follow the layout this command reads. It runs each case with and without the plugin and scores the graders. It reads cases from the plugin's own `evals/` folder, and the built plugin doesn't have one. From the repository root, copy the build and these cases to a temporary folder and run it there:

```bash
owner=devtools # use sfdc to test its independent copy
plugin="dist/claude/$owner"
tmp="$(mktemp -d)"
cp -R "$plugin/." "$tmp/"
cp -R "library/plugins/$owner/skills/principle-make-the-change-easy/evals" "$tmp/evals"
cd "$tmp" && claude plugin eval . --trust-plugin --scaffold --allow-tools Write,Edit,Bash
```

`--trust-plugin` is there because each new temporary folder would otherwise ask to be trusted, and a run without a terminal stops instead of asking.

What a run looks like, checked on Claude Code 2.1.316:

- The "with" run loads the whole owning plugin build, so Claude sees this skill under that plugin's namespace next to its other resources. Graders 03 and 04 match the name with or without a prefix.
- The eval sessions don't see your installed plugins or your personal skills in `~/.claude/skills`. In the "with" run, Claude sees only the copy under test. In the "without" run, it sees no copy at all. So the comparison between the two is clean.
- To check that every case loads without paying for any runs, add `--max-cost-usd 0`. The CLI loads every case, reports any errors, then stops before the first run.
- `--case <name>` skips loading the cases it filters out, so it can't be used to check that they load.

## Rules for using these results

- **Don't tune the description against held-out queries.** Queries marked `"holdout": true` are there to check that a change works on prompts it wasn't written for. Look at the failures in the other queries, find the type of request they represent, and write for that type. If you end up looking at held-out failures to make a change, add a few fresh queries afterward to check it.
- **Three runs per query is too few to compare small wording changes.** Claude's choices vary from run to run. In testing, a two-word change moved one query from 3 of 3 to 0 of 3. That is most likely noise, not an effect of the wording. To compare two close descriptions, run only the queries where they differ, with `RUNS=6` or more.
- **Avoid copying words from failing queries into the description.** That fixes one query and teaches nothing. Find the type of request the failure represents.

## Baseline for the current description

Measured on 2026-11-01 with `claude-opus-5-5`, 3 runs per query.

| Group | Result |
|---|---|
| Should-not-trigger, including 3 held-out trivial edits | 13 of 13 |
| Should-trigger, non-bug, original 8 | 7 of 8 (Spanish email templates missed) |
| Should-trigger, held-out routine extensions | 2 of 4 (PayPal and email search missed) |
| Bug-fix queries in the trigger test | 0 of 2 (expected, see above) |
| Bug-fix sessions | 3 of 6 (config 2 of 3, invoice 1 of 3) |

### Descriptions tried

| Version | Main idea | Non-bug triggers | Held-out | Sessions |
|---|---|---|---|---|
| Original | "Use before modifying existing code... especially when a change looks hard" | 2 of 8 | not run | 0 of 6 |
| Draft 2 | Added "check it first", "once the cause is found", and a list of difficulty signals (messy, legacy, nested) | 6 of 8 | 0 of 4 | 6 of 6 |
| Logic wording | Draws the line by what the edit touches: logic versus values or text. Dropped the difficulty signals. | 7 of 8 | 3 of 4 | 3 of 6 |
| Current | Logic wording plus "cleaning up" as a fourth job | 7 of 8 | 2 of 4 | 3 of 6 |

The legacy order query was rewritten before the "Current" run. It used to mention an attachment that wasn't there, and Claude stopped to ask for it every time. The earlier versions' non-bug scores include that broken query as a miss.

Draft 2 was the only version that got every bug-fix session. It also failed every routine feature request, because Claude read its difficulty signals as conditions. The last two versions are within run-to-run noise of each other.

## Known limits

- **The trigger test counts only the first tool call.** A skill used after Claude looks at the files counts as a miss.
- **Grader 04 checks only `Edit`.** It passes when the skill comes before the first `Edit` to the file being fixed. Claude sometimes changes the file with `Write` instead. Each side of a `tool_order` grader names one tool, and both tools have to be called. `run-session-tests.sh` counts both `Edit` and `Write`.
- **Grader 04 fails when the file never gets edited.** In the config case, stopping to ask which bug the user meant is a good outcome, and then there may be no edit at all. That grader is marked `arm: with-only`, so it is reported but not scored.
- **The judge model sees only part of a long session.** Graders of `type: llm` with `focus: trace` see the first 12 and last 12 messages. These sessions can run longer than that.
- **The config prompt doesn't name the bug, on purpose.** Asking which bug was meant passes grader 01.
- **Loose files in `evals/` are ignored by `claude plugin eval`.** This README, the two scripts, and `trigger-evals.json` produced no errors or warnings in a full unfiltered run. In the same run, a folder with a `prompt.md` but no graders was reported as an error, so the CLI does scan this folder. It only treats folders as cases.
