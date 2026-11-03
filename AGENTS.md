<!-- arti-public:rules:start -->
# Arti protocol contributor rules

- Keep the public skill lightweight, supporting chat-to-charter work and starting or restructuring repositories, with a small set of tested helpers.
- Keep agent-neutral instructions, skills, role definitions and durable project knowledge in shared files. Host files link to or are generated from those sources.
- Certify custom agents with observable Definitions of Done covering actual model and effort, permissions and cross-lab execution. Generated configuration alone is insufficient.
- Let each project choose its cross-lab review policy during setup, with no preselected policy. Enforce the policy it chooses and report whether cross-lab review actually ran.
- Gate the first public release on live Claude Code and Codex tests on macOS. Clearly label support for other hosts and operating systems.
- Use MIT for the public release and owned helpers, retaining required notices.

The canonical package is `.agents/skills/arti-sdd-protocol`. Run `npm test` and `npm run check` for implementation changes. Use real native qualification for agent, hook and review integration changes. Raw live evidence stays under `.local-evidence/`; only sanitised summaries belong in public artifacts. Build the allowlisted tree and archive with `npm run package`. Publish only on an explicit maintainer request.
<!-- arti-public:rules:end -->
