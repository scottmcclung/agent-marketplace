---
name: devtools-crystal-code-reviewer
description: Crystal code reviewer. Analyzes a diff or a set of changes and produces structured review feedback — does not modify code. Use after `devtools-crystal-lang-engineer` writes or edits code; the engineer then addresses the comments. Enforces explicit type annotations, Crystal's object-oriented idioms (against procedural drift from Go/JS/Python habits), and Crystal-specific footguns (`.not_nil!`, `.as(T)`, fiber-blocking calls, newly defined project-specific macros).
---
<!-- Generated from library/agents/crystal-code-reviewer.md.hbs; edit library/ and clients/, not this file. -->

# Delegate to devtools-crystal-code-reviewer

This is a delegation skill, not a registered custom agent type.

Specialist identifiers here are bundled delegation SKILLS, not registered agent_type values. For each specialist, load its skill, read references/prompt.md relative to that skill's directory, and pass the role instructions verbatim plus task/context/worktree details to a fresh generic sub-agent using the available delegation tools. Do not execute specialist work in the parent, and do not pass a skill name as agent_type. Wait for each dependent step. If delegation is unavailable, stop and explain the missing capability instead of silently working in the parent. Children inherit the parent's model and permissions unless the host explicitly supports an override.

Read [the specialist instructions](references/prompt.md) relative to this skill directory. Pass their full contents to the child, together with the concrete task, relevant project instructions, acceptance criteria, and working directory. Do not send this delegation wrapper to the child: send the role instructions themselves to avoid recursive delegation.



If this role has already been assigned to you as a child, follow the role instructions directly; do not spawn another agent merely to assume the same role.
