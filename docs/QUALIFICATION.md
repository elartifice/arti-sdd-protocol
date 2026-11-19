# Native qualification

Date: 2026-11-17
Package SHA256: e4b80640567b3d69a7e14a1b74a70d99eff4b075ad2b15c57b18067545b85ca0

Platform: macOS 26.6.2 arm64; 2.1.310 (Claude Code); codex-cli 0.166.0; Node v25.8.1.

This qualifies the named role tasks and stated permission boundaries, not general vendor equivalence. Claude effort is the requested setting: this client exposes no effective-effort telemetry, so effort_verified is false. Codex supplies resolved effort metadata. Raw model logs and fixture paths remain private. Native Codex uses persistent sessions because this client cannot spawn custom agents from an ephemeral parent. Hook tests review and trust only exact fixture hashes for the test process.

| Host | Role | Effective model | Effort setting | Result |
|---|---|---|---|---|
| claude | coordinator | claude-opus-5-5 | high | passed |
| claude | scout | claude-haiku-5-5 | low | passed |
| codex | coordinator | gpt-6.1-sol | high | passed |
| claude | implementer | claude-sonnet-5-5 | high | passed |
| claude | reviewer | claude-opus-5-5 | high | passed |
| codex | scout | gpt-6-luna | high | passed |
| claude | escalation | claude-opus-5-5 | high | passed |
| codex | implementer | gpt-6.1-terra | high | passed |
| claude | researcher | claude-sonnet-5-5 | high | passed |
| codex | reviewer | gpt-6.1-sol | high | passed |
| codex | escalation | gpt-6-astra | high | passed |
| codex | researcher | gpt-6.1-terra | high | passed |

Cross-lab trials: 14; two distinct seeded defects reviewed three times in each direction, plus a clean control per direction. Production author dispatches: 2, using the qualified opposite lab and canonical production receipts. Native edit and generic-dispatch guards: both hosts actually attempt the forbidden tool call and receive the audited denial. Resumes: 2; shared handoffs: 2; chat charters: 2.

Read-only native Codex roles were tested under a read-only parent; custom roles inherit parent permissions. Claude uses native tool permissions and scope hooks, without an OS-sandbox claim. Hook guards do not parse arbitrary shell writes; verified candidate scope remains required.

Workflow reliability: both native timer/reset and prerequisite-merge continuations resumed their original sessions and reached actual fixture landing; monitor restart, duplicate suppression and persisted naming passed. Both corrective-review cases included a finding from each lab and an intermediate revision before the final exact-delta review. Fresh-session draft creation passed on both hosts, and concurrent Claude/Codex worktrees completed disjoint tickets while overlapping territory was refused.

This native profile passed in a fresh complete run without transport retries. An earlier complete attempt stopped on a Claude request timeout; its failed report remains private and was not accepted. On 2026-11-19, the separate hosted Projects component passed real API readback and native Claude/Codex helper execution, actual fixture landing, claim release and worktree removal, with the same hosted Project still accessible afterward. Its bounded readback retry and exact native tool-output proof have regression coverage. The core digest and client versions are unchanged; this component probe does not claim that every role was rerun on November 19. See [adapter qualification](qualification-adapters.json).
