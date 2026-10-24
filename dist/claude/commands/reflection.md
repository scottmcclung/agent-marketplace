---
description: Review this session and propose instruction and workflow improvements for approval.
---
<!-- Generated from library/commands/reflection.md.hbs; edit library/ and clients/, not this file. -->

You are an expert in prompt engineering, specializing in optimizing AI code assistant instructions. Your task is to analyze and improve the instructions for Claude Code.
Follow these steps carefully:

0. Setup Phase:
If the project has beads issue tracking (`.beads/` directory exists), check for an existing "Process Improvements" epic:
```bash
bd list --status=open | grep -i "process improvement"
```
If none exists, create one:
```bash
bd create --title="Process Improvements" --type=epic --priority=3 --description="Tracks suggestions from reflection exercises. Each child issue captures a specific improvement: the problem identified, the reasoning, the proposed change, user feedback, and resolution."
```
Note the epic ID for use in later phases.

1. Analysis Phase:
Review the chat history in your context window.

Then, examine the applicable instructions, commands, and config for Claude Code:
<client_instructions>
AGENTS.md
CLAUDE.md
**/CLAUDE.md
.claude/commands/
.claude/skills/
.claude/settings.json
.claude/settings.local.json
</client_instructions>

Also review any previously filed process improvement issues to avoid re-raising resolved topics:
```bash
bd list --status=open | grep "\[reflection\]"
bd list --status=closed | grep "\[reflection\]"
```

Analyze the chat history, instructions, commands and config to identify areas that could be improved. Look for:
- Inconsistencies in Claude Code's responses
- Misunderstandings of user requests
- Areas where Claude Code could provide more detailed or accurate information
- Opportunities to enhance Claude Code's ability to handle specific types of queries or tasks
- New commands or improvements to a commands name, function or response
- Permissions and MCPs we've approved locally that we should add to the config, especially if we've added new tools or require them for the command to work
- Patterns that have been repeated across sessions (check against existing process improvement issues to avoid duplicates)
- Inefficient use of the limited context. Areas where Claude Code could have made better use of sub-agents.

2. Interaction Phase:
Present your findings and improvement ideas to the human. For each suggestion:
a) Explain the current issue you've identified
b) Propose a specific change or addition to the instructions
c) Describe how this change would improve Claude Code's performance

Wait for feedback from the human on each suggestion before proceeding.

For each suggestion, after receiving feedback, file a beads issue to track it:

**If the user approves the suggestion:**
```bash
bd create --title="[reflection] <concise summary>" --type=task --priority=3 \
  --description="## Issue Identified\n<what was observed>\n\n## Reasoning\n<why this is a problem>\n\n## Proposed Change\n<specific modification>\n\n## User Feedback\n<what the user said>\n\n## Decision\nAPPROVED — implement this change."
bd dep add <new-issue-id> <epic-id>
bd update <new-issue-id> --status in_progress
```

**If the user declines or defers:**
```bash
bd create --title="[reflection] <concise summary>" --type=task --priority=4 \
  --description="## Issue Identified\n<what was observed>\n\n## Reasoning\n<why this is a problem>\n\n## Proposed Change\n<specific modification>\n\n## User Feedback\n<what the user said>\n\n## Decision\nDECLINED — <reason from user>."
bd dep add <new-issue-id> <epic-id>
bd close <new-issue-id> --reason="User declined: <brief reason>"
```

This ensures every suggestion is recorded with full context regardless of outcome, enabling cross-session analysis of process improvements.

3. Implementation Phase:
For each approved change:
a) Clearly state the section of the instructions you're modifying
b) Present the new or modified text for that section
c) Explain how this change addresses the issue identified in the analysis phase
d) After implementing the change, update the corresponding beads issue:
```bash
bd update <issue-id> --notes="Implemented: <brief description of what was changed and where>"
bd close <issue-id> --reason="Change implemented successfully"
```

4. Output Format:
Present your final output in the following structure:

<analysis>
[List the issues identified and potential improvements]
[Note any previously filed issues that were skipped as duplicates]
</analysis>

<improvements>
[For each approved improvement:
1. Section being modified
2. New or modified instruction text
3. Explanation of how this addresses the identified issue
4. Beads issue ID for tracking]
</improvements>

<declined>
[For each declined suggestion:
1. What was proposed
2. Why it was declined
3. Beads issue ID for reference]
</declined>

<final_instructions>
[Present the complete, updated set of instructions for Claude Code, incorporating all approved changes]
</final_instructions>

<tracking_summary>
[Summary of all beads issues created/updated this session:
- Issue ID | Title | Status | Decision
This serves as a session log for cross-session analysis.]
</tracking_summary>

5. Finalize Phase:
After all improvements have been implemented (or declined) and the output has been presented, commit and push all changes so the working tree is clean and nothing is lost:

```bash
bd sync
git add -A
git commit -m "Reflection: process improvements from session"
git push
git status  # Must show clean working tree, up to date with origin
```

This is mandatory — reflection work is not complete until pushed. Do not ask the user whether to push; just do it.

Remember, your goal is to enhance Claude Code's performance and consistency while maintaining the core functionality and purpose of the AI assistant. Be thorough in your analysis, clear in your explanations, and precise in your implementations.

The beads tracking ensures that:
- No suggestion is lost between sessions
- Duplicate suggestions are caught before re-discussion
- The history of process improvements is auditable
- Declined suggestions are documented with rationale so they aren't re-raised
- Approved changes can be verified as implemented
