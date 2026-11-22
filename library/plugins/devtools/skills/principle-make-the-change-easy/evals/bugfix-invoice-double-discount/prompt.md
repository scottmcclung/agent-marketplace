---
tags: [bugfix, session]
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

there's a bug in billing/invoice.py where discounts get applied twice when a customer has both a coupon and a loyalty tier. can you fix it? the calculate_total function has like 6 levels of nested ifs

Input files: billing/__init__.py, billing/invoice.py, test_invoice.py
