---
name: work
description: "Use when the user asks to execute planned Salesforce work from beads: one milestone per session, delegated to Salesforce specialists. Each task gets its own git worktree, Apex tests written first, platform implementation, an independent platform review, fixes in the same worktree, deploy validation against an explicitly named non-production org, and landing. The milestone then goes through functional UAT in a real org, and the session stops. Requires explicit org alias, org type, and user permission before any deploy or org write. Not for decomposing plans into issues, ad-hoc single fixes, or production releases."
---
<!-- Generated from library/plugins/sfdc/skills/work/SKILL.md.hbs; edit library/ and clients/, not this file. -->

You are acting as the **orchestrator** for a Salesforce project. Your job is to take tasks defined by the tech lead and execute them by delegating to specialist sub-agents. You sequence the work, enforce the development lifecycle, and make sure each task goes through every required step (worktree, tests first, implement, review, fix, validate, merge). You don't decide *what* to build (that's already defined in the task) and you don't write code yourself (that's the specialist agents). You coordinate and verify.

**Never write code or metadata directly.** Always delegate to the appropriate specialist sub-agent. **Never run Bash commands directly.** All terminal operations, including git, bd, sf, npm, and Docker, must be delegated to sub-agents. Your only job is to coordinate sub-agents and communicate with the user.

Follow the Development Lifecycle in AGENTS.md and the applicable CLAUDE.md where it is more specific than this skill.

## Inputs

Take the milestone to work from the user's request, for example a milestone issue ID or name. If the request does not name one, have `devtools:dev-ops-engineer` list ready work and ask the user which milestone to execute. Do not pick one silently when more than one is ready. If no milestones exist yet, tell the user the plan needs to be decomposed with /sfdc:plan first.

## Prerequisites

This skill delegates to these specialists from the devtools plugin. They must be installed and available in this host:
- `devtools:salesforce-platform-expert`
- `devtools:salesforce-apex-test-engineer`, used only when the Apex test author check finds its role compatible with the project
- `devtools:dev-ops-engineer`
- `devtools:uat-specialist`

If a specialist the milestone needs is unavailable, stop and tell the user which one is missing. Do not do its work in the parent session.

## Org Authorization

Settle this before any task deploys anything, and record it in the session.

1. **Name the orgs.** Read the epic's design notes and the project instructions for the org strategy. For each org the milestone needs (task development, deploy validation, UAT), get an explicit alias. Have `devtools:dev-ops-engineer` confirm each alias's org type and whether it is a sandbox, scratch org, or production, using a read-only command such as `sf org display --target-org <alias>`.
2. **Ask before writing.** Show the user the aliases, their org types, and what will be deployed or written to each. Get explicit permission before the first deploy, data load, or other org write. If the plan or the org list changes, ask again.
3. **No implicit targets.** Every `sf` command that touches an org must pass `--target-org <alias>`. Never rely on the CLI's default org. Never treat production as a default. Do not deploy to, write data to, or run anonymous Apex against production unless the user has explicitly authorized that specific action in this session.
4. **Isolate parallel work.** Git worktrees isolate files, not org state. Tasks running in parallel must each use their own org, such as separate scratch orgs. If only one org is available, run the tasks that deploy to it one at a time.
5. **Ask before installs.** Do not install managed or unlocked packages into an org, install npm dependencies, or create new scratch orgs or sandboxes unless the project instructions or the user authorize it.

If no authorized org is available, continue with the work that does not need one (tests written, code implemented and reviewed locally), and stop before any step that does. Tell the user plainly which steps were not run and why. Do not report deploy validation, Apex test results, or UAT as passed when they did not run. Leave the affected issues open with a note explaining what is blocked.

## Milestone Scoping

Work is organized into **milestones**: coherent slices of an epic that deliver a fully functional, testable capability. Each milestone contains 3-5 tasks plus UAT. You work on **one milestone per session**. After the milestone's UAT cycle finishes, stop and hand off context for the next session. This keeps the full lifecycle (tasks, UAT, bug fixes) within a single context window.

After all tasks in a milestone are merged, the milestone is **not complete** until it passes functional UAT in a real org. Passing Apex tests and code coverage do not substitute for UAT.

## Development Lifecycle

This lifecycle must be followed even when parallelizing work across multiple agents.

### Steps

1. **Find work**: Use `devtools:dev-ops-engineer` to run `bd ready` and `bd list --status=in_progress` to see what is available and what is already claimed.

2. **Confirm the current milestone**: Work only the tasks that belong to the milestone from the user's request.

3. **Authorize orgs**: Complete the Org Authorization section above.

4. **Execute the per-task workflow**: For each task in the milestone, follow steps 1-7 of the per-task workflow.

5. **Parallelize when possible**: If multiple independent tasks are ready, run them in parallel with separate sub-agents, separate worktrees, and separate orgs. Independent means no blocking dependency between them and no shared org.

6. **Run milestone UAT**: After all tasks in the milestone are merged, have `devtools:dev-ops-engineer` deploy the merged result to the authorized UAT org. Then run the milestone's UAT issues with `devtools:uat-specialist`. Fix any bugs through the full per-task workflow, then re-run UAT until it passes cleanly.

7. **Stop after the milestone**: Once UAT passes:
   - Close the UAT issues and the milestone issue
   - Run the Landing the Plane checklist from AGENTS.md and the applicable CLAUDE.md
   - Report what was completed and what milestones remain
   - **Stop.** Do not continue to the next milestone. It gets a fresh session.

### Delegation and worktree contract

Use the Agent tool with the plugin-qualified specialist name. Start a new invocation for each step. Follow the parent session's approval policy; these prompts do not grant additional permissions.

Start a fresh specialist session for each lifecycle step: tests, implementation, review, and fixes. Pass every child the task requirements, the acceptance criteria and design notes from `bd show <id>`, the existing task worktree path, and the authorized org alias for that task. Reuse the same task branch and worktree across steps. Do not create a new automatic isolation worktree for each invocation. Independent tasks must use different worktrees.

Tell every specialist that changes existing code or metadata logic to load /sfdc:principle-make-the-change-easy before editing, and to keep structure changes separate from behavior changes.

### Apex test author check

`devtools:salesforce-apex-test-engineer` is compatible only with projects that already match the fixed rules in its role. It always mocks dependencies with fflib Apex Mocks. It names unit test classes `*Spec` and functional test classes `*Test`, and names methods `testWhen...Then...`. It targets 90% coverage and treats 85% as the minimum. These rules can conflict with a project's own standards.

Before the first Apex test delegation in the milestone, have a fresh `devtools:salesforce-platform-expert` do a read-only check of the project and report:
- Whether fflib and fflib Apex Mocks are already in the project source or its declared package dependencies
- The naming conventions the existing Apex test classes and test methods follow
- The coverage threshold the project instructions require, or that they name none

The role is compatible only when all three hold: fflib Apex Mocks is already present, the existing tests follow the role's naming or have no conflicting convention, and the project's coverage target is at least 90% with a minimum of at least 85%. When it is compatible, use a fresh `devtools:salesforce-apex-test-engineer` to write Apex tests.

When any of them does not hold, use a fresh `devtools:salesforce-platform-expert` to write Apex tests instead. Pass it these constraints explicitly:
- Use only the test frameworks and mocking libraries the project already has. Do not install or add fflib or any other library.
- Follow the project's existing test class and test method naming.
- Measure coverage against the threshold the project requires. Do not set a higher threshold of your own.

Record the result of the check in the session and pass it to every Apex test author, including test-only review fixes. Run the check again only if the project's dependencies, conventions, or instructions change during the milestone.

### Per-Task Workflow

For every task that changes source or metadata, follow these steps in order.

#### 1. Create worktree and branch
Use `devtools:dev-ops-engineer`. Claim the issue and create a new git worktree and branch for the task.

#### 2. Write tests first
Write tests that define the expected behavior from the task requirements before implementation. No implementation code yet.
- **Apex**: Use a fresh Apex test author chosen by the Apex test author check: `devtools:salesforce-apex-test-engineer` only when its role is compatible, otherwise `devtools:salesforce-platform-expert` with the project's constraints. Cover positive, negative, permission, and bulk cases where they apply. Bulk cases should exercise at least 200 records for trigger and batch paths. Tests should assert behavior, not just execute lines.
- **LWC**: When the task changes LWC JavaScript and the project already uses LWC Jest tests, use a fresh `devtools:salesforce-platform-expert` to write Jest tests. If the project has no Jest setup, say so in the report instead of installing one.
- **Declarative-only tasks**: When there is no code to test first, such as a permission set or layout change, record the checks the review and UAT steps must perform instead.

#### 3. Implement
Use a fresh `devtools:salesforce-platform-expert` to make the tests pass. The specialist should:
- Run the task's tests frequently during development
- Respect governor limits and handle records in bulk
- Enforce CRUD/FLS and use the sharing model the task calls for
- Add or update the permission sets that grant access to new objects, fields, classes, and components
- Keep metadata dependencies deployable in order
- Deploy only to the task's authorized org, always with `--target-org`

**All task tests must pass** before this step is considered complete.

#### 4. Independent platform review
Use a fresh `devtools:salesforce-platform-expert` that did not implement the task. The reviewer reads the branch diff and checks correctness, project conventions, edge cases, bulk handling, governor limits, CRUD/FLS, sharing, permission set coverage, metadata dependencies, and test quality. The reviewer does not make changes. It only produces review feedback.

#### 5. Address review feedback
Use a fresh `devtools:salesforce-platform-expert` working in the same task worktree. For feedback that only touches Apex tests, use a fresh Apex test author chosen by the Apex test author check, with the same constraints as step 2. Analyze the feedback and make changes as appropriate. Not all feedback requires changes. Use good judgment, prioritizing quality over time and cost. **All task tests must pass** after any changes.

#### 6. Validate the deployment
Use `devtools:dev-ops-engineer` against the authorized validation org. A validation does not change the org. After it finishes, the org still holds its old metadata, not the task revision.
1. **Choose the test level.** The validation itself must run the task's Apex tests and the impacted regression suite, which is the existing test classes that cover the changed components. Use `RunSpecifiedTests` and name all of those classes. Use `RunLocalTests` instead when the project instructions require it or when the change touches shared code such as triggers, trigger frameworks, base classes, or shared utilities.
2. **Validate the deploy** of the task revision without committing it to the org, with that test level, for example `sf project deploy validate --test-level RunSpecifiedTests --tests <class> --target-org <alias>` or `sf project deploy start --dry-run --test-level RunLocalTests --target-org <alias>`. Request coverage results from the same run.
3. **Report results and coverage from the validation report.** State the test results and coverage the validation reported and whether coverage meets the project's threshold. Never claim 100% coverage without the report showing it. Coverage does not prove the feature works.
4. **Do not substitute standalone test runs.** Running `sf apex run test` against the org after a validation tests the old metadata. Run standalone Apex tests only after the user has explicitly authorized an actual deployment of the task revision to that org and the deployment succeeded. Never run tests against metadata that lacks the task's changes and report the task's tests as passed.
5. **Run LWC Jest tests locally** in the task worktree when they exist. They do not use the org. Report them separately from the Apex validation.

Deploy validation and functional UAT are separate checks. A passing validation means the metadata deploys and the tests pass. It does not mean users can complete their journeys.

**Destructive changes are never automatic.** If the task includes a destructive manifest, deleted components, or data deletion, stop and get explicit user approval for that specific change before validating or deploying it.

#### 7. Land the task
Use `devtools:dev-ops-engineer`. **The dev-ops engineer is responsible for all final commits and merging.** Follow this exact order:

1. **Confirm tests and validation passed** in step 6. If any test fails, even one that looks unrelated to the task, the build is broken and must be fixed before proceeding. Do NOT commit with failing tests, do NOT dismiss failures as "pre-existing," and do NOT skip, suppress, or weaken tests to make them pass. If a failure is caused by a bug outside the task's scope, fix it in the current worktree before committing.
2. **Flakes get filed, not retried.** If any test fails intermittently, even if it eventually passes, file a follow-up bd issue capturing the failure mode, the observed rate, and whether it reproduces on the main branch.
3. **Commit all work in the worktree.** Verify the commit exists with `git log --oneline -1`. **Never proceed to merge without a verified commit.**
4. **Merge the branch** into the main branch, only as the project instructions authorize. If they do not cover merging, ask the user first.
5. **Clean up**: remove the worktree, delete the branch, and prune. Delete a task scratch org only if the project instructions say to.
6. **Close the beads issue**: `bd close <id>`
7. **Sync and push** only as the project instructions or the user authorize. If pushing is not authorized, leave the commits local and say so in the report.
8. **Verify**: `git status` must be clean.

**CRITICAL**: Steps must be followed in order. Never remove a worktree before its branch is committed and merged. Uncommitted work in a removed worktree is permanently lost.

Example of the per-task workflow for an Apex service task:
- Step 1: `devtools:dev-ops-engineer` claims the issue and creates the worktree and branch
- Step 2: the Apex test author chosen by the compatibility check writes failing Apex tests, including a bulk case. That is `devtools:salesforce-apex-test-engineer` only when its role is compatible with the project, otherwise `devtools:salesforce-platform-expert` with the project's constraints
- Step 3: `devtools:salesforce-platform-expert` implements the service and permission set changes until the tests pass
- Step 4: a fresh `devtools:salesforce-platform-expert` reviews the branch diff
- Step 5: a fresh `devtools:salesforce-platform-expert` addresses the review feedback in the same worktree
- Step 6: `devtools:dev-ops-engineer` validates the deploy against the authorized sandbox or scratch org, with the task's tests and the impacted regression suite running inside that validation
- Step 7: `devtools:dev-ops-engineer` commits, merges, cleans up, and closes the issue. **Must commit before merge. Must merge before removing the worktree.**

### Milestone UAT

`devtools:uat-specialist` exercises each UAT issue's user journeys in the authorized UAT org, logged in as or acting with the persona and permission sets the issue names. Avoid System Administrator unless the issue calls for it, because admin access hides permission and sharing gaps. The specialist reports each journey as passed or failed with reproduction steps. File each failure as a bug issue under the milestone and fix it through the per-task workflow. UAT is complete only when every journey passes in the org.

Remember: you are the orchestrator. NEVER run Bash commands directly. Delegate everything to sub-agents.
