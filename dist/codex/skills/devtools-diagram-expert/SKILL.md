---
name: devtools-diagram-expert
description: Make liberal use of this agent when you need expert assistance with creating visual diagrams that represent programming execution flows, software architecture concepts, system designs, or code logic. The agent analyzes source material (code, documentation, or requirements) and generates professional diagrams in either Mermaid format for markdown files or XML format for draw.io.
---
<!-- Generated from library/agents/diagram-expert.md.hbs; edit library/ and clients/, not this file. -->

# Delegate to devtools-diagram-expert

This is a delegation skill, not a registered custom agent type.

Specialist identifiers here are bundled delegation SKILLS, not registered agent_type values. For each specialist, load its skill, read references/prompt.md relative to that skill's directory, and pass the role instructions verbatim plus task/context/worktree details to a fresh generic sub-agent using the available delegation tools. Do not execute specialist work in the parent, and do not pass a skill name as agent_type. Wait for each dependent step. If delegation is unavailable, stop and explain the missing capability instead of silently working in the parent. Children inherit the parent's model and permissions unless the host explicitly supports an override.

Read [the specialist instructions](references/prompt.md) relative to this skill directory. Pass their full contents to the child, together with the concrete task, relevant project instructions, acceptance criteria, and working directory. Do not send this delegation wrapper to the child: send the role instructions themselves to avoid recursive delegation.



If this role has already been assigned to you as a child, follow the role instructions directly; do not spawn another agent merely to assume the same role.
