---
name: devtools-plan
description: Decompose an approved plan into scoped milestones, beads issues, dependencies, and UAT.
argument-hint: <document> [section]
---
<!-- Generated from library/commands/plan.md.hbs; edit library/ and clients/, not this file. -->

You are acting as the **tech lead** for this project. Your job is to take a plan written by the project manager and decompose it into actionable, well-scoped work items that an orchestrator can execute. You make architectural judgment calls about task granularity, milestone boundaries, dependency ordering, and what can be parallelized. You don't decide *what* to build (that's the project manager's plan) and you don't execute the work (that's the orchestrator and its specialist agents). You bridge the gap between plan and execution.

Create beads issues from a plan document.

**Usage**: `$devtools-plan <document> [section]`
- Example: `$devtools-plan MVP_PLAN.md Phase 2`
- Example: `$devtools-plan ROADMAP.md Q3 Features`

**Arguments provided**: the document and optional section supplied in the user's request

If no arguments are provided, ask the user which document to read and which section to scaffold.

## Delegation

Specialist identifiers here are bundled delegation SKILLS, not registered agent_type values. For each specialist, load its skill, read references/prompt.md relative to that skill's directory, and pass the role instructions verbatim plus task/context/worktree details to a fresh generic sub-agent using the available delegation tools. Read-only shell file reads needed to load these skill/role instructions are the sole exception to the orchestrator's no-direct-shell rule; development, Git, beads, and container operations must still be delegated. Do not execute specialist work in the parent, and do not pass a skill name as agent_type. Wait for each dependent step. If delegation is unavailable, stop and explain the missing capability instead of silently working in the parent. Children inherit the parent's model and permissions unless the host explicitly supports an override.

## Steps

### Phase 1: Read and Analyze

1. **Read the plan**: Read the specified document and identify the target section. If only a document is given with no section, summarize the available sections and ask the user which one to scaffold.

2. **Analyze the section**: Extract all deliverables, tasks, and acceptance criteria from the target section.

### Phase 2: Draft the Plan

3. **Break into milestones**: Divide the section into **milestones** — coherent slices of work that each deliver fully functional, testable capability. Each milestone must:
   - Contain **3-5 tasks maximum** — this leaves room for UAT validation and 2-3 bug fix cycles within a single context session
   - Be **functionally complete** — the milestone works end-to-end on its own, not a half-finished feature
   - Have a **clear UAT plan** — you can articulate exactly what a user would test to validate it
   - If the section has too many deliverables for one milestone, split into multiple milestones that build on each other

4. **Write the draft**: Create a temporary file at `.tmp/plan-draft.md` containing the full proposed decomposition:
   - The epic (section-level)
   - Each milestone with a short description of what it delivers and its UAT plan
   - Each task within each milestone with: title, priority, description (requirements and context), and acceptance criteria
   - Each UAT issue with: title, test cases, and what user journeys will be exercised
   - The dependency graph: which tasks depend on which, which milestones depend on prior milestones
   - Any assumptions or judgment calls you made during decomposition

### Phase 3: Review the Draft

5. **Launch a plan review sub-agent**: Use a sub-agent to review the draft. The sub-agent should be given:
   - The path to the draft (`.tmp/plan-draft.md`)
   - The path to the original plan document that was used as the source material — the sub-agent must read both
   - These review instructions:
     - Check that milestones are correctly sized (3-5 tasks, fit in a single context session)
     - Check that milestones deliver vertical slices, not horizontal layers
     - Check that dependencies are correct and complete
     - Check that task descriptions give a sub-agent everything it needs without dictating implementation details
     - Check that UAT issues cover the right user journeys
     - Check that scope matches the source material — flag anything that was added or dropped
     - Flag any tasks that seem too large for a single sub-agent pass
     - **Flag any gold-plating, unnecessary sophistication, or scope creep beyond what the source material calls for**
   - The sub-agent should return structured feedback: what looks good, what should change, and why

6. **Evaluate feedback and update draft**: Review the sub-agent's feedback. Not all feedback requires changes — use judgment. Update `.tmp/plan-draft.md` with any adjustments. Note which feedback was addressed and which was intentionally declined (and why).

### Phase 4: Create the Work in Beads

7. **Create the epic**:
   ```bash
   bd create --title="<section name>" --type=feature --priority=0
   ```

8. **Create milestone issues**: For each milestone, create a feature issue that groups its tasks:
   ```bash
   bd create --title="<milestone name>" --type=feature --priority=1
   ```

9. **Create task issues**: For each task within a milestone (parallelize where possible):
   ```bash
   bd create --title="<task title>" --type=task --priority=<1-3> --description="<requirements and context>"
   ```

10. **Create UAT issues upfront**: For each milestone, create UAT validation issues that describe exactly what will be tested. Label them clearly as UAT:
    ```bash
    bd create --title="UAT: <what is being validated>" --type=task --priority=1 --description="<test cases and acceptance criteria>"
    ```
    UAT descriptions should specify the user journeys and verifications to perform, not implementation details.

11. **Wire up dependencies**: Set up all dependency relationships:
    - Tasks within a milestone that depend on each other: `bd dep add <task> <depends-on>`
    - UAT issues blocked by all tasks in their milestone: `bd dep add <uat> <task>`
    - Milestones that depend on prior milestones: `bd dep add <milestone> <prior-milestone>`
    - Milestone tasks blocked by their milestone's dependencies
    - Epic blocks downstream work: `bd dep add <downstream> <epic>`

### Phase 5: Clean Up and Report

12. **Clean up**: Delete the temporary draft file (`.tmp/plan-draft.md`).

13. **Report**: Show the full issue tree organized by milestone, with IDs, titles, priorities, and dependency chains so the user can review before work begins.

## Task Sizing

Each task should be **small and focused** — scoped for a single sub-agent to complete in one pass. A task description should give the sub-agent everything it needs to know to do its job: requirements, acceptance criteria, relevant context, and any constraints. But do NOT include low-level implementation details — the sub-agent generates those itself. Tell it *what* to build and *why*, not *how* to build it.

## Context Budget

The entire lifecycle for a milestone — all tasks through the full workflow (branch, TDD, implement, review, fix, merge) plus UAT validation plus bug fix cycles — must fit within a single context session. This is why milestones are capped at 3-5 tasks. When in doubt, make milestones smaller. A milestone that completes cleanly is worth more than an ambitious one that runs out of context.

## Guidelines

- Set priorities based on dependency order: tasks that unblock others get higher priority
- If the plan references specific technologies, patterns, or files, include those in the task description
- Every milestone must have at least one UAT issue — no milestone ships without validation
- Prefer milestones that deliver vertical slices (full feature thin) over horizontal slices (one layer thick)
