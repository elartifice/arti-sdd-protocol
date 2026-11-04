---
name: arti-sdd-protocol
description: Plan a project in chat or establish and upgrade a lightweight spec-driven workflow in a new or existing repository. Produces a portable project charter, shared agent instructions and knowledge, tickets with evidence, and qualified Claude Code/Codex roles. Use for project charter or working-protocol setup; use the installed project rituals for ordinary feature work.
license: MIT
---

# Arti SDD protocol

Choose the requested outcome before doing work. Honour existing decisions and authorisation; an audit or planning request stays read-only. Explain material choices, then continue authorised work without repeating approval ceremonies.

Chat needs only Markdown. Repository helpers need Node.js 22+ and Git; Claude Code and Codex use existing CLI logins. Other agents can read AGENTS.md and run helpers directly.

## Choose a route

- **Chat or blueprint:** Read [charter.md](references/charter.md). Produce one `PROJECT-CHARTER.md` containing scope, architecture, milestones, tickets, acceptance evidence, settled decisions and open questions. Mark assumptions that require repository inspection. No installation or tools are required.
- **New repository:** Read [repository.md](references/repository.md). Validate an existing charter or collect missing decisions, inspect the target folder, then preview and apply only the chosen protocol. The charter's explicit facts win over heuristics; report contradictions.
- **Existing repository or upgrade:** Read [repository.md](references/repository.md). Inventory rules, skills, work and planning before changing them. Reconcile owner content, preserve IDs and unfinished work, and show the exact changes. Never audit this package's assets as project code.
- **Agents and review:** Load [agents.md](references/agents.md) when configuring, qualifying or delegating a custom team. Prepare ordinary delegation with `scripts/dispatch.mjs`; select the bound native role or explicit desktop model/effort, then verify native evidence. Generated profiles alone do not establish production routing.

## Small shared core

Keep project rules in `AGENTS.md`, skills in `.agents/skills`, role sources in `.agents/roles`, and durable project knowledge in `.agents/memory`. Host paths link to or are generated from these sources. Read the relevant shared knowledge at startup and include it in delegated work. Host-private memory is a cache, never the only home of a lasting project rule. See [hosts.md](references/hosts.md).

Use an approved specification for work spanning tickets. Give each ticket a goal, dependencies, exact territory and observable Definition of Done. Keep one active ticket per implementation session unless the owner authorises a coordinated batch. Use isolated worktrees for concurrent work. Stage explicit paths and preserve unrelated changes.

Before setup, settle six choices: merge policy, planning/tracker location, hosts, QA depth, team/review policy, and board. Cross-lab review has **no preselected policy**. Store stable option IDs; free-text rationale does not change policy. The owner can choose required, risk-scoped, opportunistic or disabled review. Unknown choices remain undecided.

Use the helpers for deterministic setup, guards, claims and reviews. Fail closed when a required check cannot run. Unsupported host hooks use explicit checks and an honest reduced-capability label. Hooks are guardrails, not a complete shell security boundary.

Required review passes only for the exact candidate snapshot with a qualified binding, complete coverage and a valid final response. Missing authentication/model/base, startup chatter, truncation and stale evidence cannot become a pass. Same-lab review remains labelled same-lab.

Optional board, recording, deployment, tracker and backup modules are described in [optional.md](references/optional.md); they are not installed by this core. Never claim those modules are verified. Preserve consent, real evidence, cleanup decisions and raw latency when adopting one.

Finish with what was installed, what actually passed, remaining limitations, and the next ticket or command. Keep receipts private unless a sanitised report is explicitly selected for sharing. Never publish, deploy, send messages or change global configuration merely because the skill was invoked.
