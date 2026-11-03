# Project charter

In chat, explain that the result is a blueprint for a coding agent. Establish the product goal, users, stack/surfaces, deployment, constraints and success criteria. Separate confirmed facts from assumptions. Do not infer that a planned UI, deployment or AI feature is absent because no repository exists.

Collect only missing choices: merge policy (`manual` or `auto`); planning (`committed`, with an optional external tracker handled separately); hosts (`claude`, `codex`, `other`); QA (`checks`, `checklist`, `recorded`); team and cross-lab policy (`required`, `risk`, `opportunistic`, `disabled`); and board (`markdown` in this core). Do not preselect cross-lab policy. A risk policy names the relevant risk labels. Explain consequences without imposing this skill's examples on the project.

Use [PROJECT-CHARTER.md.tmpl](../templates/PROJECT-CHARTER.md.tmpl). The marked JSON block is the machine-readable handoff; prose supplies architecture, product milestones and rationale. Leave unknowns explicitly null until resolved. Never invent model access, native host support, source paths or completed tests. A coding agent validates the JSON and inspects the actual repository before setup; it preserves settled decisions while reporting conflicts.

Milestones need a concrete outcome. Tickets name dependencies, territory hints and acceptance evidence. A ticket's pre-merge evidence must not depend on its own post-merge close-out. Product facts and ticket IDs remain editable by the owner; the structured block is the single source for setup choices.
