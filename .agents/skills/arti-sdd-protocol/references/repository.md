# Repository workflow

Inspect Git state, existing planning, instructions, skills, hooks and user-owned sections before writing. Do not read secret files. The default durable layout is committed `arti_sdd/` planning and `.agents/` shared sources, with `arti_sdd/.state/` ignored. Runtime claims/locks share the common Git directory; branch-local planning and executable code remain on their own revision.

Validate the charter's marked JSON block. Explicit false, none and later decisions are real values. Report detected contradictions and retain their provenance. Existing setup decisions remain in `arti_sdd/config.json`; upgrades never reinterpret rationale or reset choices to heuristic defaults.

Preview the exact operations with `node <skill>/scripts/setup.mjs plan --repo <path> --config <charter-or-json>`. Apply that plan with `setup.mjs apply`; inspect with `setup.mjs check`. Preserve owner content outside protocol markers, unrelated hooks and existing skills. Refuse unreadable, malformed, conflicting or hand-modified managed files; reconcile them before applying. Repeat apply must be stable and interrupted apply must be recoverable.

Installed rituals cover orientation, claim, plan, land and handoff. Reads and discussion do not need a claim. Minimal ticket creation/repair is allowed before claiming; product writes require the selected claim/territory checks. A repeated startup or resume supplies context without resetting an active task or approval. Headless reviewers skip interactive orientation only.

Before landing: verify scope, required checks, DoD evidence and the chosen review policy against the candidate revision. Under manual merge, leave the ticket in review until merge is confirmed. Post-merge close-out records the actual merge, resolves claims/locks, and preserves dirty worktrees. A queued auto-merge is not a completed merge. New work after reopening receives a new revision and fresh evidence; an old merged PR cannot close it again.

Commit approved planning and setup on the actual integration branch before claiming. Setup records its Git metadata reference and mirrors the branch name in config. Claims freeze that integration revision's territory, exclusions, checks, generation, dependencies and risks; editing then reclaiming a working ticket cannot approve a weaker contract. Evidence/status updates remain editable. Contract or policy changes require an owner-approved planning commit on integration before renewed ownership. Review bases must be integration ancestors; closeout checks that integration branch, generation and verification revision. These are trusted local coordination records, not a security boundary against a process that can rewrite Git state.

The core does not bypass branch protection, create remote repositories or publish. Remote claim operations and pushes require the project's existing authorisation. Local-only mode explicitly lacks cross-machine exclusivity.

Remote compare-and-create protects a ticket ID across clones. Territory overlap checks cover active local claims; cross-machine work on different tickets requires coordinator-assigned disjoint territories. Dead recorded coordination owners can be recovered; ownerless or interrupted recovery locks need explicit inspection rather than an unsafe age-based takeover.
