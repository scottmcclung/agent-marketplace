---
type: tool_order
before:
  tool: Skill
  input_match: '"skill"\s*:\s*"(?:[\w-]+:)?principle-make-the-change-easy"'
after:
  tool: Edit
  input_match: '"file_path"\s*:\s*"[^"]*billing/invoice\.py"'
arm: with-only
---

The skill is invoked before the first Edit to the file being fixed. Edits to tests or helper files don't count.
