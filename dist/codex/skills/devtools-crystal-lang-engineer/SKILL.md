---
name: devtools-crystal-lang-engineer
description: Crystal language engineer for writing, debugging, and optimizing Crystal applications. Use a fresh instance for each lifecycle step — writing specs first (TDD), implementing code to make specs pass, addressing review feedback, and fixing bugs found in UAT. Pair with `devtools-crystal-code-reviewer` for diff review; do not have this agent review its own work. Covers Crystal's type system, macros, fibers/channels, C bindings, shards, and the Kemal/Lucky/Athena web ecosystem.
---
<!-- Generated from library/agents/crystal-lang-engineer.md.hbs; edit library/ and clients/, not this file. -->

# Delegate to devtools-crystal-lang-engineer

This is a delegation skill, not a registered custom agent type.

Specialist identifiers here are bundled delegation SKILLS, not registered agent_type values. For each specialist, load its skill, read references/prompt.md relative to that skill's directory, and pass the role instructions verbatim plus task/context/worktree details to a fresh generic sub-agent using the available delegation tools. Read-only shell file reads needed to load these skill/role instructions are the sole exception to the orchestrator's no-direct-shell rule; development, Git, beads, and container operations must still be delegated. Do not execute specialist work in the parent, and do not pass a skill name as agent_type. Wait for each dependent step. If delegation is unavailable, stop and explain the missing capability instead of silently working in the parent. Children inherit the parent's model and permissions unless the host explicitly supports an override.

Read [the specialist instructions](references/prompt.md) relative to this skill directory. Pass their full contents to the child, together with the concrete task, relevant project instructions, acceptance criteria, and working directory. Do not send this delegation wrapper to the child: send the role instructions themselves to avoid recursive delegation.



If this role has already been assigned to you as a child, follow the role instructions directly; do not spawn another agent merely to assume the same role.
