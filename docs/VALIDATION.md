# Validation and release boundaries

The release gate combines deterministic regression tests, native CLI qualification, and verification of the exact exported artifacts. The versioned native results and package digest are in [QUALIFICATION.md](QUALIFICATION.md) and [qualification.json](qualification.json).

| Area | Observable acceptance |
|---|---|
| Charter and setup | Explicit false and undecided review policy survive handoff; new/unborn and existing repositories preserve owner content; repeat apply is stable. |
| Setup preservation and recovery | A real killed installer restores original bytes only in its originating worktree; stale concurrent previews refuse; disabled owned adapters retire without removing owner agents. |
| Scope and ownership | Literal paths, moves, dangling links, worktrees and header IDs are checked; two competing owners cannot claim one ticket; disjoint claims can proceed. |
| Coordination | Real separate clones compare-and-create a unique remote claim; interrupted acquisition preserves remote intent; approved integration contracts cannot be weakened by editing and reclaiming. |
| Completion | Required review belongs to this ticket and generation; an old merge cannot close reopened work; cleanup reserves completion before releasing claims and locks. |
| Native roles | Every enabled role is actually invoked; client model metadata, task behavior, retained assertions, shared knowledge and permission boundaries have separate checks. |
| Ordinary dispatch | Production helper emits supported native arguments, rejects stale bindings and correlates actual child model/effort evidence. Both native clients deny generic routes; desktop bindings have separate live task checks without a native-profile claim. |
| Shared discovery | Both clients discover the canonical protocol and five rituals; Claude links resolve to the shared files. Fresh-context handoffs read durable knowledge and existing approval. |
| Review | Both labs consume the supplied complete dossier in isolated processes; repeated security/quantity defects and clean controls test quality; incomplete, stale or unqualified evidence cannot pass. |
| Distribution | An allowlisted source tree and skill ZIP exclude private inputs and raw logs; actual extraction, installation and exported-source tests run locally. |

Run `npm test` and `npm run check` without models. `npm run test:live` explicitly uses existing CLI authentication and quota. `node dev/package.mjs --require-qualified` requires a fresh passing release report for the package being exported. The [hosted CI workflow](https://github.com/elartifice/arti-sdd-protocol/actions/workflows/check.yml) runs the deterministic macOS/Linux Node 22/24 matrix. Require a successful run on the exact release commit before creating a release; the workflow history is separate from native qualification.

The local deterministic suite passes 90 tests with no skips on Node.js 22.23.4 and 25.8.1. The exported source also passes all 90 tests. This includes actual process races, separate Git clones, worktrees, linked CLI execution and killed-installer recovery, rather than only rendered-configuration assertions.

Claude exposes requested effort settings without effective-effort telemetry. Codex native read-only roles inherit the parent's permissions and are qualified under a read-only parent. Use the isolated external reviewer from a writable coordinator. Hook guards do not enforce arbitrary shell writes; the candidate's approved scope and checks remain required at verification.

The named role profiles govern those invocations. The host's primary session model remains the user's choice, and the primary session coordinates delegation subject to the host's nesting limits. An existing coordinator-issued claim can be validated without writing protected runtime state; acquiring or releasing ownership remains a coordinator operation.

Remote claims protect ticket IDs across machines; local frozen territory checks do not replace coordinator-assigned disjoint work across different clones. Native integrations beyond the recorded macOS Claude Code/Codex versions remain unqualified. Desktop model routing is tested separately; desktop native profile selection and hook enforcement remain unsupported/unproven. Optional graphical board, recording, deployment, issue-mirror and backup implementations are outside this core.

Raw transcripts, synthetic session IDs and temporary workspace paths remain private. Persisted native test sessions remain for the owner to manage. The proposed public source is `dist/public-repository/` with fresh history, rather than this implementation checkout's history. No build or validation command uploads a release.

The routing-cost replay uses the same recorded requests and separately checks replacement-model context tiers, unknown-role handling, coordinator-policy effects and independently calculated totals. It does not assert measured token reduction or equal quality under replacement models. Board and update guides describe optional future implementation; no new runtime module is claimed.
