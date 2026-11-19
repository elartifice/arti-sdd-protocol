# Owner-led adoption and feedback

The shared skill is maintained here. Each project owner adopts a reviewed version in that project separately. A shared-skill change does not authorize rewriting other repositories, installing services, registering timers or refreshing their hooks automatically.

Before adopting, ask the project's agent to inventory the actual discovered skill path/version, copied runtime, host adapters, owner rules, shared knowledge, active tickets/claims and current qualification. Compare the package digest as well as its version: development copies with the same version may differ. Distinguish the current public core from historical/custom engines; matching names or version numbers do not establish compatibility.

Preview the managed changes and preserve existing ticket IDs, owner content, approval records, model bindings and durable knowledge. Reconcile active work before changing its runtime. Retain a verified recovery path. Only apply the owner's selected scope, then test the actual installed setup and relevant native host behavior. A passing upstream fixture is not evidence that adoption occurred or that a project's hooks loaded.

Report a failure through [the upstream issues](https://github.com/elartifice/arti-sdd-protocol/issues). Search existing issues first. Add a sanitized reproduction to an overlapping issue, or create a distinct actionable issue when the failure differs.

Useful report fields:

- Skill version and digest; installed adapter/runtime family and whether it is a development snapshot.
- Host/client version and surface: CLI, desktop, native role or explicit manual helper.
- Expected behavior, observed behavior, and the smallest reproduction.
- Actual source/revision and command result, with personal paths and private content removed.
- Evidence level: source inspection, deterministic fixture, actual native probe or verified installed-project behavior.
- Whether the command executed and rejected the request, or a host permission check stopped it before execution.
- Relevant existing issue and any temporary workaround, without claiming the workaround fixes upstream.

Never attach credentials, raw private transcripts, customer data or full private state. Use generic ticket IDs and fixture paths. Mark unknown coverage, unavailable sources and unsupported capabilities explicitly. A clean board card or success message does not replace a verification receipt.

For researcher feedback, include the pinned collector revision, requested lookback, actual date range and per-source outcomes. An unavailable X route is different from zero search results. Do not send browser cookies or API keys to reproduce it.

Issue [#15](https://github.com/elartifice/arti-sdd-protocol/issues/15) tracks this feedback workflow; individual bug reports remain the implementation homes. Publication, global installation and adoption in another repository remain separate actions.
