# Native qualification

Date: 2026-11-04
Current verifier package SHA256: 2dd9242dc4a086dc288d38b6792cc0b9f18a70fcb50c94a82c893759ec5fa9e4
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

Additional native routing probes cover Claude model and effort overrides, and Codex model/effort overrides, omitted native selectors and full-history forks. All received actual hook denials. Guard evidence is a supplemental batch against the same package; component harness hashes are recorded in qualification.json. Claude effective effort remains unobservable.

Five Codex desktop role tasks also passed: see [desktop-qualification.json](desktop-qualification.json). Native state proves their model, resolved effort and fresh context. The desktop tool cannot select native profiles, and sealed role-source delivery is not independently observable.

Scout qualification uses two additional native executions with withheld fixture answers. Both children read or content-searched the two seeded files. The original Codex component run encountered a search-output path parsing error after execution; the recorded native evidence was rechecked with the corrected parser, without new model calls. Execution and replay harness hashes are recorded in qualification.json.

The original native qualification and role tasks executed on the execution package above. The only subsequent package change updates the dispatcher verifier to require a completed latest child turn. The corrected verifier was replayed against fresh native thread reads and saved rollouts for five Codex CLI roles and five desktop roles; the full qualification fixtures were not rerun on the current package. The delegated message is sealed, so task correlation checks the native child path and completed report nonce; it does not verify delivery of the task payload.
