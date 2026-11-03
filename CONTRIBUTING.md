# Contributing to Arti SDD Protocol

Useful contributions include reproducible failures, clearer examples and verified host integrations. Describe the intended behaviour, what happened, the relevant client/runtime versions and a small fixture. Keep credentials, personal paths, private transcripts and real project data out of issues and patches.

## Keep the core small

The installable source is `.agents/skills/arti-sdd-protocol`. Its entry point routes readers to the detail they need. Put public explanations, fixtures and maintainer tooling outside it unless they materially improve runtime reliability.

Keep shared rules, skills, role instructions and project knowledge in canonical files. Host adapters link to or are generated from those sources. Retain MIT and required notices. Read [AGENTS.md](AGENTS.md) for contributor rules.

## Make a reviewable change

State the problem, expected outcome, scope and observable acceptance evidence. Inspect existing work first and preserve owner content. A small documentation change needs proportionate verification; changes to installation, ownership, guards or review need meaningful negative-path coverage too.

Use the local deterministic checks:

```sh
npm test
npm run check
```

Node.js 22+ and Git are required; there is no runtime package installation step. Check Markdown links and render changed Mermaid diagrams. Keep the tested model table and any example mapping consistent with the dated qualification evidence, rather than presenting them as universal defaults.

## Native integration changes

For changes affecting native roles, hooks, transports or review evidence, run the applicable real-client qualification. The complete release gate is:

```sh
npm run test:live
```

This explicitly uses existing Claude Code/Codex logins and quota. It is separate from deterministic CI. Do not provision credentials or relax a denied permission silently. Record actual role invocation, provider/model evidence, permission limits and results. Raw logs stay private; only reviewed sanitised evidence belongs in the repository.

Changing the installable package invalidates the matching release digest. Requalify as required before claiming a new qualified release. Requested Claude effort and native Codex permission inheritance must remain honestly labelled. See [agent setup](docs/AGENT-SETUP.md) and [validation boundaries](docs/VALIDATION.md).

## Before a release

Follow the [publication guide](docs/RELEASE.md). Build the allowlisted export, check the actual tree/history and archive, and retain the hashes. Hosted CI and support claims must reflect work that actually ran. Publishing or creating a remote requires an explicit maintainer request.
