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