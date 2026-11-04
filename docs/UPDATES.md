# How updates reach projects

Arti has two layers: a skill an agent discovers, and the workflow files installed into a project. Updating the first does not silently regenerate the second.

| Layer | Current behaviour | What an update changes |
|---|---|---|
| Shared user skill | One reviewed copy at `~/.agents/skills/arti-sdd-protocol`; Claude and Codex link to it. | That copy becomes available to both hosts on a subsequent skill load. A project-local copy can still be selected instead, and an already-running conversation may retain previously loaded instructions. |
| Repository skill and runtime | Setup copies the reviewed skill into `.agents/skills/arti-sdd-protocol`, generates project rituals/adapters, and records `.agents/install.json`. | These are project snapshots. Updating the user skill leaves their files, project decisions and model bindings intact. |
| Shared project knowledge | Rules, decisions, lessons and handoffs belong to that project. | A skill release is not a replacement for this knowledge. |
| Published GitHub release | A maintainer publishes a reviewed version separately from a source branch or draft PR. | GitHub can notify people who watch releases; the project installer does not poll GitHub. |

Hosts handle duplicate names differently. Current [Claude Code documentation](https://code.claude.com/docs/en/skills#resolve-skills-that-share-a-name) gives a personal skill priority over a same-named project skill for `/name`; [Codex documentation](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills) says both same-named skills can appear rather than being merged. Ask the agent to report the actual loaded path and `package.json` version. Discovering the newer user skill still does not refresh a project's copied runtime or generated adapters.

**There is currently no automatic fleet upgrade or release notifier.** Local setup checks validate the installed state; they do not check every repository against the user installation or the latest GitHub release. A draft patch is not an available published release.

## The lightweight direction for future releases

Prefer **notify, preview, approve and qualify**. At project startup, a future optional local check could compare the project installation manifest with the reviewed canonical user package identity, version and content digest and show a short notice:

```text
Example future notice — not a current command output:
Project: 0.4.0  ·  Reviewed user skill: 0.4.1
A newer reviewed version is available. Preview this project's changes before applying it.
```

That comparison needs no background daemon, transcript upload or network request. A legacy engine with a different package identity needs an explicit compatibility decision; matching version numbers alone do not prove matching content. A newer GitHub version would only become the local reference after its maintainer or user reviews and installs it. GitHub release notifications can cover remote availability without adding a network dependency to every coding session.

A project refresh should preserve its decisions, owner rules, role bindings and shared knowledge; preview the managed diff; stop on drift; and apply only the authorised changes. Changed hooks or agents then need native checks and qualification. Stale review evidence must not become valid merely because a version number changed. The existing setup recovery/drift safeguards support deliberate refreshes; a migration system and automatic notifications are future work.

Pointing every project's runtime directly at one mutable global directory would make propagation immediate, but it would also change hooks and agent behaviour in many repositories before their checks ran. The current project snapshots keep that change reviewable. This first release focuses on initial setup; an updater belongs in a small, separately tested change once there are existing users to support.
