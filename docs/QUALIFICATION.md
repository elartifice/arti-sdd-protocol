# Native qualification

Date: 2026-11-04
Current package SHA256: 1dd5e7fb4eca945146b4dd5ff29fb89b1d6e5ea35d4193b124aa87d92234147b
Execution package SHA256: 0f9c26d16f3a4c889afb4ff4982521d106653fc36c5a25a795c232ae747b2caf

Platform: macOS 26.6.2 arm64; 2.1.310 (Claude Code); codex-cli 0.166.0; Node v25.8.1.

This qualifies the named role tasks and stated permission boundaries, not general vendor equivalence. Claude effort is the requested setting: this client exposes no effective-effort telemetry, so effort_verified is false. Codex supplies resolved effort metadata. Raw model logs and fixture paths remain private. Native Codex uses persistent sessions because this client cannot spawn custom agents from an ephemeral parent. Hook tests review and trust only exact fixture hashes for the test process.

| Host | Role | Effective model | Effort setting | Result |
|---|---|---|---|---|
| claude | coordinator | claude-opus-5-5 | high | passed |
| claude | scout | claude-haiku-5-5 | low | passed |
| codex | coordinator | gpt-6.1-sol | high | passed |
| claude | implementer | claude-sonnet-5-5 | high | passed |
| codex | scout | gpt-6-luna | high | passed |
| claude | reviewer | claude-opus-5-5 | high | passed |
| codex | implementer | gpt-6.1-terra | high | passed |
| claude | escalation | claude-opus-5-5 | high | passed |
| codex | reviewer | gpt-6.1-sol | high | passed |
| codex | escalation | gpt-6-astra | high | passed |

Cross-lab trials: 14; two distinct seeded defects reviewed three times in each direction, plus a clean control per direction. Production author dispatches: 2, using the qualified opposite lab and canonical production receipts. Native edit and generic-dispatch guards: both hosts actually attempt the forbidden tool call and receive the audited denial. Resumes: 2; shared handoffs: 2; chat charters: 2.

Read-only native Codex roles were tested under a read-only parent; custom roles inherit parent permissions. Claude uses native tool permissions and scope hooks, without an OS-sandbox claim. Hook guards do not parse arbitrary shell writes; verified candidate scope remains required.

Additional native routing probes cover Claude model and effort overrides, and Codex model/effort overrides, omitted native selectors and full-history forks. All received actual hook denials. Guard evidence is a supplemental batch against the immediately preceding package; component harness hashes are recorded in qualification.json. Claude effective effort remains unobservable.

Five Codex desktop role tasks also passed: see [desktop-qualification.json](desktop-qualification.json). Native state proves their model, resolved effort and fresh context. The desktop tool cannot select native profiles, and sealed role-source delivery is not independently observable.

Scout qualification uses two native executions on the immediately preceding package with withheld fixture answers. Both children read or content-searched the seeded files. An earlier component encountered a search-output parser error; its original report and correction remain in private evidence.

The original native qualification executed on the execution package above. The current package changes the dispatcher verifier and dispatch hook. Two Scout tasks and eight ordinary routing guard probes ran on the immediately preceding package; the final package also verifies confirmed hook-denied attempts and explicitly generates a foreground Claude call. The other eight role tasks and cross-lab trials retain their original execution provenance. The current verifier was replayed against fresh native thread reads and saved rollouts for five Codex CLI roles and five desktop roles, and replayed recorded Claude streams for five roles; the full qualification was not rerun on the current package. The delegated message is sealed, so task correlation checks the native child path and completed report nonce; it does not verify delivery of the task payload.

In a separate Claude experiment, the native Agent call stream included an unplanned `resume` argument, while the host omitted it from the PreToolUse hook input. The hook therefore did not prevent that call. The verifier rejected the recorded call after dispatch; pre-execution prevention for this argument is not established. The failed hook probe remains in private evidence.

The original Claude implementer and handoff executions explicitly requested `run_in_background: false`; both pass the current verifier. This foreground setting cannot resume prior context.

A Claude Scout execution on the immediately preceding package confirmed the generated `run_in_background: false` argument, the expected child model, completion and source reads. Its answer was verified from the recorded run after the initial private harness rejected trailing explanatory notes. For the five historical Claude replays, the current plans were reconstructed with the same dispatch IDs and tasks; their original plans omitted this now-generated flag.

The verifier now scopes Claude calls to the dispatch ID, allowing multiple unrelated worker calls in one coordinator log. Saved recordings of the original implementer and escalation tasks on both hosts were also checked for a successful exact test command executed by the child; a parent-run test or child claim alone is insufficient.

Native Codex verifier replay also reads the observed parent: child and parent checkouts must agree and belong to the planned Git repository, with matching current team and adapter sources. This supports a coordinator in the main checkout targeting a linked worktree. The receipt does not attest an intended parent ID or the encrypted loaded role body; it describes inference from native identity and checked local sources. Desktop native profile identity remains unsupported.
