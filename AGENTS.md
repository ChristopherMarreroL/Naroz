# Naroz repository guidance

## Tooling

- Use Bun for dependency installation and project scripts.
- Before completing a code change, run `bun x tsc -b`, `bun run lint`, and `bun run build`.
- Keep file processing in the browser unless a feature explicitly requires a backend.

## Review guidelines

- Prioritize functional regressions, broken downloads, corrupt output, build failures, and data loss over style-only comments.
- Verify that browser resources are released: Blob URLs, PDF.js documents, FFmpeg temporary files, workers, canvases, and large in-memory buffers.
- Review asynchronous hooks for stale state, missing cleanup, unrecoverable loading states, and retry failures.
- Check locale changes against both explicit user preferences and `navigator.languages`; Spanish devices should default to Spanish and every other language to English.
- Confirm new user-facing text exists in both Spanish and English and does not briefly render in the wrong language.
- Check desktop and mobile layouts for overlap, clipped controls, inaccessible actions, and unintended horizontal overflow.
- Treat client-side privacy regressions, unsafe HTML rendering, and untrusted file parsing as high priority.
## Local quality gates

- Do not push, merge, deploy, or publish without explicit user authorization; summarize local changes first. Do not name new branches `/codex`.
- Review the final diff and run relevant regression, integration, and parser security tests before finishing. Use `bun run verify` for lint, tests, and the TypeScript production build; do not declare completion with failed gates or unresolved high-severity findings.
- For substantial parser or lifecycle changes, use independent functional, security, memory, compatibility, TypeScript, and ES/EN accessibility reviews; verify fixes afterward.
- Never commit private documents, extracted contents, or private test fixtures. Generate synthetic fixtures and keep parser diagnostics free of filenames and document data.
