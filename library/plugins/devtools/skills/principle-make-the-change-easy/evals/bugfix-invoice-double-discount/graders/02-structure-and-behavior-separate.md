---
type: llm
focus: trace
weight: 1
---

If the session restructures calculate_total (for example flattening the nested ifs), that restructuring and the double-discount fix are made as separate edits, and the restructuring is confirmed to leave behavior unchanged before or after the fix. A session that only fixes the bug without restructuring passes this check only if it reports the nesting as a cleanup for later.
