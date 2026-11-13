# GitHub publication and release guide

Public destination: [elartifice/arti-sdd-protocol](https://github.com/elartifice/arti-sdd-protocol). [Version 0.4.0 is published](https://github.com/elartifice/arti-sdd-protocol/releases/tag/v0.4.0). This guide records its publication copy and the checks to repeat for later releases.

## Repository identity

Repository: **`elartifice/arti-sdd-protocol`**, public. Display name: **Arti SDD Protocol**.

Copy-ready GitHub About description:

> Spec-driven development with focused Claude/Codex agents: clear specs, bounded tickets, shared memory and verified reviews. Route work to the right model and keep context focused.

Suggested topics:

`spec-driven-development`, `sdd`, `ai-coding`, `agent-skills`, `coding-agents`, `claude-code`, `codex`, `developer-tools`, `project-planning`

The homepage/website field can stay empty until there is a real destination. Do not add status badges that imply an unrun CI workflow or unqualified host support.

## Release title and description

Title: **Arti SDD Protocol v0.4.0 — shared context, explicit scope, verified work**

Copy-ready release text:

> Arti gives AI coding projects a clear specification, a bounded work queue and an observable definition of done.
>
> Use it in chat to create a project charter and blueprint, or with a coding agent to start or organise an existing repository. It is designed to reduce the lost decisions, moving scope, overlapping edits and unverifiable “done” claims that can accumulate as vibe coding grows into a project.
>
> Claude Code and Codex share rules, skills, role sources and durable project knowledge. Custom roles have explicit per-host model/effort bindings. Cross-lab review runs the other provider against a complete candidate snapshot and records whether it actually completed. Each project chooses its review policy during setup, with no preselected policy.
>
> Optional focused workers keep investigation logs out of the main chat and let bounded tasks use cheaper models. Stronger review and escalation remain available. Savings depend on routing and overhead; the documented local study distinguishes API repricing, context measurements and subscription bills.
>
> The installable core has 22 files, about 122 KB, and no runtime package dependencies. Repository helpers require Node.js 22+ and Git; chat planning needs Markdown only. Native review/qualification uses existing CLI logins and quota.
>
> The dated macOS qualification covers all five roles on both hosts, repeated seeded reviews and clean controls, actual dispatch in both directions, edit denials, resumes, shared handoffs and chat charters. See the qualification report for exact versions, models, evidence and permission/effort limits. Other native hosts and operating systems remain unqualified.
>
> MIT licensed. Graphical boards, recording, deployment, issue mirrors and backup automation are outside this core.

The published v0.4.0 release contains `arti-sdd-protocol-0.4.0.zip` and `SHA256SUMS`. Documentation on `main` may improve after a release; its tag and installable archive remain fixed. Release copy can link to the current overview graphics and cost study while retaining links to the exact release qualification.

## Routing patch v0.4.1

Patch title: **Arti SDD Protocol v0.4.1 — explicit worker routing**.

The patch adds one small dispatch helper, with fresh-context dossiers and actual native child verification. It fixes generic-worker model inheritance, required native arguments and conflicting overrides. Claude and Codex native roles, both review directions and five desktop bindings have dated evidence. Desktop native profile selection and role-source delivery remain unobservable; Claude effective effort remains unobservable.

The current core has 23 files, about 146 KB, a 581-word entry point and no runtime package dependencies. The v0.4.0 tag and ZIP stay fixed. Publish this patch only after its reviewed export and exact-commit CI pass under maintainer authority; packaging and local installation do not create a release.

## Documentation included in the public tree

| File | Purpose |
|---|---|
| [README.md](../README.md) | Explain SDD, the problems addressed, the three entry routes and setup. |
| [AGENT-SETUP.md](AGENT-SETUP.md) | Model/effort table, role DoDs, shared sources, diagrams and both review proofs. |
| [workflow](assets/workflow.svg) and [agent architecture](assets/agent-architecture.svg) | Editable, colourful top-to-bottom graphics with accessible descriptions. |
| [COSTS.md](COSTS.md), [historical data](cost-study.json) and [routing projection](routing-cost-study.json) | Counted tokens, observed prices, corrected-routing assumptions, baselines and coverage limits. |
| [BOARD.md](BOARD.md) and [board UI example](assets/board-example.svg) | Markdown planning and an illustrative optional graphical extension with acceptance checks. |
| [UPDATES.md](UPDATES.md) | Shared user installation versus project snapshots; proposed notification-first updates. |
| [team example](examples/team-2026-11-03.json) | Dated explicit bindings matching the tested release profile; new projects still qualify their own setup. |
| [QUALIFICATION.md](QUALIFICATION.md) and [qualification.json](qualification.json) | Actual dated results and installable package digest. |
| [VALIDATION.md](VALIDATION.md) | Deterministic coverage, native boundaries and deferred capabilities. |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contributor workflow and appropriate checks. |
| [LICENSE](../LICENSE) | MIT and required notice. |

The workflow and agent hierarchy are self-contained SVGs under `docs/assets`, with text and accessible descriptions kept editable. The hierarchy shows tasks down and reports back up to one coordinator, with role icons and provider marks on the reviewer. No external fonts, scripts or tracking are embedded. [Vendor-mark sources and ownership](assets/BRAND-MARKS.md) are recorded separately from the MIT grant for original work. Supporting shared-source and review diagrams use Mermaid. The main workflow shows a ticket contract, parallel disjoint work, per-ticket validation, serial landing and the next-ready-ticket loop. The board illustration uses fictional data and does not imply a bundled application. Check the overview graphics at README width and verify their paths in the published tree.

## First release and future versions

This release's user journey focuses on first installation and setup in new or existing repositories. A user-facing version-migration journey is deferred until later releases have users. Retain owner-content preservation and recovery during initial setup; these also protect existing repositories. For future versions, plan compatibility notes, version detection and tested migration/rollback before promising a supported upgrade path. No extra migration helpers are added now.

## Remaining gaps and publication actions

The v0.4.0 macOS release gate and all four [hosted CI jobs](https://github.com/elartifice/arti-sdd-protocol/actions/runs/41675351000) passed before the release was created. Repeat these gates for future authorised publication:

1. **Use the approved destination and reviewed copy.** The initial publication is authorised for the public repository `elartifice/arti-sdd-protocol`. Later publishing still needs a maintainer request.
2. **Publish only the reviewed export.** The local build provides the allowlisted tree and ZIP described below. Keep using that tree, with privacy and notice checks for the exact tree/history and archive. The initial public history is already fresh; build later changes on that history and keep the private implementation checkout out of it.
3. **Require green hosted CI.** The [workflow](https://github.com/elartifice/arti-sdd-protocol/actions/workflows/check.yml) covers macOS/Linux and Node 22/24. Resolve failures and require all four jobs to pass on the exact release commit before creating a release. Local passing tests are separate evidence.
4. **Check the GitHub presentation and release asset.** Verify SVG/Mermaid rendering, relative links and the uploaded ZIP's hash against the local manifest, then tag/release only within the maintainer's approval.

Initial publication uses fresh history from the reviewed export. Once that public history exists, build later reviewed changes on it; do not restart or force-rewrite it for every release.

These are declared scope limits, not pending claims of support:

- Live host support is limited to the exact macOS Claude Code/Codex versions and surfaces in the reports. Codex desktop model/effort routing has separate bounded task evidence; its tool cannot select native profiles and its hook coverage is unproven. Linux/Windows journeys and additional agents/IDE surfaces need their own evidence.
- Claude effective effort is not observable in the tested client. Codex native roles inherit parent permissions; hooks are not a complete shell security boundary.
- The fixture results do not establish general vendor/model equivalence or availability on another account. Requalify changed bindings, aliases, role sources, package or clients.
- Remote claims protect ticket IDs; cross-clone work on different tickets still needs coordinator-assigned disjoint territory.
- Optional graphical board, recording, deployment, tracker-mirror and backup implementations are deferred. No functionality is promised from those modules in this release.

## Build and inspect locally

From the source repository:

```sh
npm test
npm run check
node dev/package.mjs --require-qualified
```

The output is:

```text
dist/arti-sdd-protocol-0.4.1.zip    Installable skill only
dist/public-repository/           Allowlisted source and documentation
dist/manifest.json                Package/archive hashes and every public source hash
```

The qualification gate compares the installable package digest. Documentation outside that package can be improved without invalidating its native run; the updated public source tree still needs its export/privacy checks. Changes to the installable skill require fresh applicable qualification.

The build audits the exact archive and source payloads. `ARTI_PRIVATE_TERMS_FILE` can point to a private JSON list of account/project terms for an additional scan. Raw logs, private evidence, real implementation tickets, fixture paths and historical source variants stay outside the public tree. Review a fresh Git-history preview of that tree before any later upload.

The live matrix uses existing authentication and quota. Native Codex test parents persist because the tested client cannot spawn custom agents from an ephemeral parent; those sessions remain for the owner to manage. No build or qualification command creates a remote or uploads a release.
