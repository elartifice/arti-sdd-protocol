# Native qualification

Date: 2026-11-03
Package SHA256: c1999cd64cb34a6371237705782fe4d2725a3a891d8fa15337ed2ab5da672534

Platform: macOS 26.6.2 arm64; 2.1.310 (Claude Code); codex-cli 0.166.0; Node v25.8.1.

This qualifies the named role tasks and stated permission boundaries, not general vendor equivalence. Claude effort is the requested setting: this client exposes no effective-effort telemetry, so effort_verified is false. Codex supplies resolved effort metadata. Raw model logs and fixture paths remain private. Native Codex uses persistent sessions because this client cannot spawn custom agents from an ephemeral parent. Hook tests review and trust only exact fixture hashes for the test process.

| Host | Role | Effective model | Effort setting | Result |
|---|---|---|---|---|
| claude | coordinator | claude-opus-5-5 | high | passed |
| claude | scout | claude-haiku-5-5 | low | passed |
| claude | implementer | claude-sonnet-5-5 | high | passed |
| claude | reviewer | claude-opus-5-5 | high | passed |
| claude | escalation | claude-opus-5-5 | high | passed |
| codex | coordinator | gpt-6.1-sol | high | passed |
| codex | scout | gpt-6-luna | high | passed |
| codex | implementer | gpt-6.1-terra | high | passed |
| codex | reviewer | gpt-6.1-sol | high | passed |
| codex | escalation | gpt-6-astra | high | passed |

Cross-lab trials: 14; two distinct seeded defects reviewed three times in each direction, plus a clean control per direction. Production author dispatches: 2, using the qualified opposite lab and canonical production receipts. Native edit guards: both hosts actually attempt the forbidden tool call and receive the audited denial. Resumes: 2; shared handoffs: 2; chat charters: 2.

Read-only native Codex roles were tested under a read-only parent; custom roles inherit parent permissions. Claude uses native tool permissions and scope hooks, without an OS-sandbox claim. Hook guards do not parse arbitrary shell writes; verified candidate scope remains required.
