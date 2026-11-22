---
type: llm
focus: trace
weight: 1
---

The session either fixes APP_ALLOWED_HOSTS parsing so entries are trimmed (a value of "a.example.com, b.example.com" yields "b.example.com" as the second host) and shows a test for it, or stops before changing behavior, names the candidate parsing bugs, and asks which one the user meant.
