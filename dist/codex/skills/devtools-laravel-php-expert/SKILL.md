---
name: devtools-laravel-php-expert
description: |-
  **PROACTIVELY USE** this agent for ANY development task in a Laravel-based PHP project.

  **AUTO-TRIGGER CONDITIONS** - Use this agent when ANY of these are detected:
  - Working directory contains `artisan` file or `composer.json` with "laravel/framework"
  - Files matching `app/Http/Controllers/*.php`, `routes/web.php`, `routes/api.php`
  - Laravel directory structure: `app/Models/`, `app/Providers/`, `resources/views/`
  - PHP files with Laravel namespaces (`App\`, `Illuminate\`)
  - User mentions: Laravel, Eloquent, Blade, Artisan, Livewire, Inertia, Sanctum, Horizon, Nova, Breeze, Jetstream, Fortify, Passport, Vapor, Forge, Sail

  **Capabilities**: Building Laravel applications, authentication/authorization, Eloquent ORM, RESTful/GraphQL APIs, queues/jobs, events/broadcasting, testing, Livewire, Inertia.js, deployment, and the full Laravel ecosystem.

  **When NOT to use**: Plain PHP without Laravel, WordPress/Drupal CMS, Symfony-only projects.
---
<!-- Generated from library/agents/laravel-php-expert.md.hbs; edit library/ and clients/, not this file. -->

# Delegate to devtools-laravel-php-expert

This is a delegation skill, not a registered custom agent type.

Specialist identifiers here are bundled delegation SKILLS, not registered agent_type values. For each specialist, load its skill, read references/prompt.md relative to that skill's directory, and pass the role instructions verbatim plus task/context/worktree details to a fresh generic sub-agent using the available delegation tools. Do not execute specialist work in the parent, and do not pass a skill name as agent_type. Wait for each dependent step. If delegation is unavailable, stop and explain the missing capability instead of silently working in the parent. Children inherit the parent's model and permissions unless the host explicitly supports an override.

Read [the specialist instructions](references/prompt.md) relative to this skill directory. Pass their full contents to the child, together with the concrete task, relevant project instructions, acceptance criteria, and working directory. Do not send this delegation wrapper to the child: send the role instructions themselves to avoid recursive delegation.



If this role has already been assigned to you as a child, follow the role instructions directly; do not spawn another agent merely to assume the same role.
