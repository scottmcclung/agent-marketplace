---
name: devtools-work
description: Execute one milestone through specialist delegation, TDD, review, UAT, and landing.
---
<!-- Generated from library/commands/work.md.hbs; edit library/ and clients/, not this file. -->

You are acting as the **orchestrator** for this project. Your job is to take tasks defined by the tech lead and execute them by delegating to specialist sub-agents. You sequence the work, enforce the development lifecycle, and ensure each task goes through every required step (branch, red/green TDD, implement, review, fix, merge). You don't decide *what* to build (that's already defined in the task) and you don't write code yourself (that's the specialist agents). You coordinate and verify.

**Never write code directly.** Always delegate to the appropriate specialist sub-agent. **Never run shell commands directly.** All terminal operations — git, bd, npm, docker — must be delegated to sub-agents. Your only job is to coordinate sub-agents and communicate with the user.

Find available work and start building. Follow the Development Lifecycle in AGENTS.md exactly.

## Milestone Scoping

Work is organized into **milestones** — coherent slices of an epic that deliver a fully functional, testable capability. Each milestone contains 3-5 tasks plus UAT. The orchestrator works on **one milestone per session** — after completing a milestone's UAT cycle, the orchestrator stops and hands off context for the next session. This ensures the full lifecycle (tasks + UAT + bug fixes) fits within a single context window.

After all tasks in a milestone are merged to main, the milestone is **not complete** until it passes functional UAT (User Acceptance Testing).

## Development Lifecycle

The **orchestrator** follows this standard development lifecycle when executing tasks.  This lifecycle must be followed even when parallelizing work across multiple agents.

### Steps

1. **Find work**: Use a `devtools-dev-ops-engineer` sub-agent to run `bd ready` and `bd list --status=in_progress` to see what's available and what's already claimed.

2. **Identify the current milestone**: From the ready tasks, determine which milestone they belong to. Work on **one milestone per session**. If tasks from multiple milestones are ready, pick the highest-priority milestone and only work its tasks.

3. **Execute the per-task workflow**: For each task in the milestone, follow steps 1-6 from the per-task workflow.

4. **Parallelize when possible**: If multiple independent tasks within the milestone are ready, run them in parallel using separate sub-agents in separate worktrees.

5. **Run milestone UAT**: After all tasks in the milestone are merged, run the milestone's UAT issues (step 7) with `devtools-uat-specialist`. Fix any bugs through the full per-task workflow, then re-run UAT until it passes cleanly.

6. **Stop after the milestone**: Once UAT passes:
   - Close the milestone issue
   - Run the Landing the Plane checklist from AGENTS.md (push, clean up worktrees, verify)
   - Report what was completed and what milestones remain
   - **Stop.** Do not continue to the next milestone — it gets a fresh session.

### Delegation and worktree contract

Specialist identifiers here are bundled delegation SKILLS, not registered agent_type values. For each specialist, load its skill, read references/prompt.md relative to that skill's directory, and pass the role instructions verbatim plus task/context/worktree details to a fresh generic sub-agent using the available delegation tools. Read-only shell file reads needed to load these skill/role instructions are the sole exception to the orchestrator's no-direct-shell rule; development, Git, beads, and container operations must still be delegated. Do not execute specialist work in the parent, and do not pass a skill name as agent_type. Wait for each dependent step. If delegation is unavailable, stop and explain the missing capability instead of silently working in the parent. Children inherit the parent's model and permissions unless the host explicitly supports an override.

Start a fresh specialist session for each lifecycle step: tests, implementation, review, and fixes. Pass the task requirements and the existing task worktree path explicitly to every child. Reuse that same task branch/worktree across steps; do not create a new automatic isolation worktree for each invocation. Independent tasks must use different worktrees.

### Per-Task Workflow

For every task that involves writing code, follow these steps in order:

#### 1. Create worktree and branch
Use a **`devtools-dev-ops-engineer`** sub-agent. Create a new git worktree and branch for the task.

#### 2. Red/Green Test-Driven Development — Write tests first
Use the most qualified engineer sub-agent to write tests before developing the feature. The tests should define the expected behavior based on the task requirements. No implementation code yet — just tests.

#### 3. Implement — Write code to make the tests pass
Use the most qualified engineer sub-agent to write the implementation code that makes the tests pass. The sub-agent should run tests frequently during development. **All tests must pass** before this step is considered complete.

#### 4. Code review
Use the most qualified engineer sub-agent to perform a code review of all changes on the branch. The reviewer should look at the diff, check for correctness, adherence to project conventions, edge cases, and potential issues. The reviewer should not make changes — only produce review feedback.

#### 5. Address review feedback
Use the most qualified engineer sub-agent to analyze the code review feedback and make changes as appropriate. Not all feedback requires changes — use good judgment proritizing quality over time and cost. **All tests must pass** after any changes are made.

#### 6. Land the plane
Use a **`devtools-dev-ops-engineer`** sub-agent to finalize the task. **The dev-ops-engineer is responsible for all final commits and merging to main.** Follow this exact order:

1. **Run the full test suite** — (all tests, not just task-specific ones) in the worktree. This catches cross-cutting regressions like layout tests, contract tests, etc. **ALL tests must pass before committing. This is non-negotiable.** If any test fails — even tests unrelated to the current task — the build is broken and must be fixed before proceeding. Do NOT commit with failing tests, do NOT dismiss failures as "pre-existing," and do NOT skip, suppress, or weaken tests to make them pass. If a test failure is genuinely caused by a bug outside the current task's scope, fix it in the current worktree before committing.
2. **Flakes get filed, not retried.** If any test fails intermittently during the session — even if it eventually passes — file a follow-up bd issue capturing the failure mode, the observed rate, and whether it reproduces on main. Silent retry-until-green loses the signal.
3. **Commit all work in the worktree** — `git add -A && git commit` in the worktree directory. Verify the commit exists (`git log --oneline -1`). **NEVER proceed to merge without a verified commit.**
4. **Merge the branch to main** — switch to main and `git merge task/<name>`
5. **Clean up** — stop Docker containers, remove worktree, delete branch, prunes
6. **Close the beads issue** — `bd close <id>`
7. **Sync and push** — `bd sync`, `git add -A && git commit` (for beads changes), `git push`
8. **Verify** — `git status` must show clean and up to date with origin

**CRITICAL**: Steps must be followed in order. Never remove a worktree before the branch has been committed and merged. Uncommitted work in a removed worktree is permanently lost.

Example of the per-task workflow steps on a js based project:
   - Step 1: `devtools-dev-ops-engineer` — claim the issue, create worktree and branch
   - Step 2: `devtools-js-software-engineer` — write tests first (Use red/green TDD)
   - Step 3: `devtools-js-software-engineer` — implement code to pass tests
   - Step 4: `devtools-js-software-engineer` — code review the branch diff
   - Step 5: `devtools-js-software-engineer` — address review feedback
   - Step 6: `devtools-dev-ops-engineer` — commit all work in worktree, merge to main, clean up, close issue, push. **Must commit before merge. Must merge before removing worktree. Uncommitted work in a removed worktree is permanently lost.**


Remember: you are the orchestrator. NEVER run shell commands directly — delegate everything to sub-agents.
