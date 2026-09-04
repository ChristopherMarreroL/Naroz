# File compatibility layer

Processing remains in the browser. No uploads, conversion APIs, private fixtures, or document-content diagnostics were added.

## Architecture and scope

`src/lib/fileCompatibility/core.ts` defines the shared successful-preflight shape, typed error carrier, PDF signature check and ES/EN error-key mapping. Adapters own their format decisions; tools retain their existing processing and lifecycle responsibilities. Failed preflights throw coded errors rather than handing a partially parsed document to a tool.

- **PDF:** `pdf.ts` opens an editable session with a preflight, page count, `appendTo` and `dispose`. Ordinary PDFs use pdf-lib copying. Actual encryption selects PDF.js raster compatibility. `pdfRuntime.ts` also supplies the safe opener for Delete Pages previews and PDF → Office, which already use PDF.js and do not need intermediate raster normalization.
- **Office:** `office.ts` reuses the bounded ZIP reader, checks the actual OpenXML main part, namespaces, content types and package relationship. DOCX merge, Office → PDF and the shared Excel reader use it. DOCX output is checked before creating its download URL. Readable editing restrictions are reported without deliberately removing them.
- **Compound Office:** `compound.ts` inspects actual directory stream names with bounded FAT/DIFAT/directory traversal and cycle checks. It recognizes encrypted OOXML packages without invoking SheetJS's unbounded compound-path construction.
- **Images:** `image.ts` exposes `preflightImage`, reusing the existing signature/dimension readers. It reports dimensions and estimated RGBA bytes. Existing image-tool decoders still perform complete decoding; the old assertion API and converters remain intact.
- **Video/audio audit:** existing per-file/batch limits and FFmpeg parsing remain in place. Native metadata failure must not reject a format that FFmpeg can decode. No speculative codec detector or DRM bypass was added. This iteration does not provide a new DRM-specific diagnosis or rewrite the existing media hooks.

## PDF behavior and limits

The original bug was copying encrypted PDF content with `ignoreEncryption: true`, which does not decrypt streams. Both merge and deletion now share the compatibility session and never use that option.

The installed pdf-lib 1.x does not preserve its `EncryptedPDFError` prototype reliably. Detection compares the error message to an instance of that library's exported error, rather than relying on `name` or `instanceof`.

Normal files preserve vector/text content. Compatibility pages become JPEG images at scale 2 (quality 0.92), with the rotated PDF.js viewport defining the output size. The user sees a localized notice explaining loss of selectable text. The compatibility path now adds safe external URI link annotations over the image: it preserves explicit HTTP(S), mailto and tel links, and detects HTTP(S), www and bare-domain addresses from existing left-to-right PDF text. Bare domains default to HTTPS. It respects rotation, cropping and UserUnit. Substring hit areas use approximate substitute-font metrics. No OCR is added; text selection, internal navigation, forms and other interactive annotations are not restored.

Link reconstruction uses streamed text with bounded item/character counts, at most 1,000 annotations/links per page and 10,000 reconstructed links per output. Cancellation closes the text reader. URI actions are rebuilt with hexadecimal UTF-8 bytes rather than copying action dictionaries; regression tests cover PDF syntax injection, unsafe schemes, geometry, explicit destination precedence and cancellation.

### Clickable-link regression (2026-09-04)

The supplied original and comparison merge contain no explicit link annotations: viewers infer the address from preserved text. Rasterization removed that text and therefore viewer detection. The corrected local UI merge of the three private source PDFs produces three visible pages, each with one explicit URI annotation pointing to the expected academic domain. Private inputs and rendered previews are kept outside the repository. Synthetic tests cover mixed merge and page selection across all four rotations, cropping and UserUnit; the unit suite also covers domains without a protocol and avoids matching email fragments or decimals.

Validation for the link correction: standalone TypeScript, lint and production build passed; 69 unit tests / 578 assertions passed. The browser matrix passed 29/30 initially; a Chrome lifecycle test was interrupted by a local-server navigation, then passed when repeated with stable files. All six link integration cases passed across Chromium, Chrome and Edge. Independent review found a PDF literal-string injection risk; hexadecimal URI serialization and a save/reopen regression fixed it before delivery. No remaining actionable review findings. The final private output is 581,110 bytes. Source-code diff whitespace checks pass; the pre-existing staged PDF fixture has standard PDF cross-reference whitespace and was not rewritten.

Rendering is sequential, capped at 16 million pixels and 8192 pixels per side per canvas, with the existing source-dimension guard. Each output operation permits at most 250 million compatibility pixels and 100 MiB encoded images. Merge retains its 1000-page cap; Delete Pages retains its 200-page cap. A canvas, page and loading task are released on success, failure and cancellation.

Compatibility output must reopen, have the expected page count, and render up to five representative pages, including normalized-page samples. This catches parse/render failures; it cannot prove semantic fidelity for every arbitrary PDF. Legitimately blank pages are not rejected merely for being blank.

PDF.js opening-password errors are shown as password-required. No password entry or password bypass is implemented.

## Office behavior and limits

Existing ZIP budgets remain: 2000 entries, 100 MiB actual expansion, compression ratio 250. XML DOM creation additionally allows at most 8 MiB text and 100,000 markup openings. XML UTF-8 and UTF-16LE/BE are decoded before parsing. DTD/entities and traversal entries are rejected. Main-part namespace and relationship validation blocks mislabeled or incomplete packages.

The DOCX worker retains transfer lists, timeout, cancellation and termination. The accumulated input expansion cap remains 200 MiB. No private data is logged by the new code or the modified document error handlers.

Limitations: Strict OpenXML is explicitly unsupported; complex valid Word/PowerPoint layouts remain limited by their existing libraries. XLS and CSV support is preserved. Encrypted OOXML containers are detected even if named XLS, but legacy BIFF FILEPASS encryption does not yet have a dedicated password classification. Inputs near the new XML resource limits can now fail safely instead of allocating an unbounded DOM.

## Reproducible validation

- `bun run verify`: lint, Bun unit/integration/security tests, TypeScript production build.
- `bun x tsc -b`: standalone TypeScript gate when needed.
- `bun run test:browser`: Chromium PDF integration, lifecycle, real download, mobile Spanish UX tests.
- `node node_modules/@playwright/test/cli.js test --project=chrome --project=edge`: the same browser suite with locally installed Chrome/Edge.
- First browser setup: `bun x playwright install chromium` (CI adds `--with-deps`).

CI extends the existing PR workflow rather than adding a duplicate. It uses frozen Bun installation and runs tests, Chromium checks, lint, TypeScript and build. It has read-only repository permissions, no secrets and no deploy step. Branch protection still requires repository administration; a workflow alone cannot enforce merge policy.

All four checked-in PDF fixtures are synthetic. `scripts/generate-compatibility-fixtures.py` regenerates them with reportlab, pypdf and cryptography. The browser suite uses real AES-256 PDFs, compares rendered pixels and geometry, checks normal text preservation, validates output count, tests opening passwords, and checks cancellation/reset/unmount/retry/resource cleanup. Office fixtures are generated in memory.

Synthetic performance observation: two twelve-page compatibility runs plus a cancelled run took approximately 2.3–5.8 seconds during development on this machine. The instrumented canvas set contained 43 canvases, all at zero dimensions after cleanup, and no remaining PDF.js workers. These are observations, not portable performance thresholds or a complete process-heap leak proof.

## Independent review log

| Role | Findings | Resolution |
| --- | --- | --- |
| Functional/regression | UTF-16 OpenXML rejected; partial Excel batches lost specific error reasons | BOM-aware decoding and reasons in partial-success messages |
| Test engineer | Malformed PDF page-count access escaped error classification; missing lifecycle/security cases | Coded failure and synthetic regression tests; DOCX worker error, timeout, retry, cancellation, unmount, corrupt output and URL cleanup tests |
| Security | Unbounded SheetJS CFB directory-path cycle | Bounded independent directory inspector; malicious pointer/FAT cycle tests; reviewer verified rejection |
| Performance/memory | XML DOM allocation unbounded; old preview canvases relied on GC; unawaited redundant cleanup | XML byte/markup caps; zero canvas dimensions in finally; loading-task destruction owns cleanup; pixel budget checked before raster allocation |
| Compatibility | No additional blocking regression; Strict OpenXML and legacy BIFF limitations identified | Limitations documented; actual encrypted/mixed browser tests added |
| TypeScript/code quality | New Spanish messages had invalid UTF-8 bytes | Re-encoded correctly; regression checks for replacement characters |
| I18n/UX/accessibility | Normalization notice lacked live announcement; corrupt PDF.js errors generic | Polite status region and InvalidPDFException mapping; ES mobile UI tests |
| Final verifier | Four redundant asynchronous PDF-to-Office document cleanup calls; final diff and CI review | Removed redundant calls, retained awaited loading-task destruction; TypeScript, lint, 59 tests and production build passed; no unresolved high-severity findings |

## Original private reproducer

Verified locally after the user supplied the three private source documents and the defective prior merge. The actual Naroz merge UI produced a new PDF with three pages in the selected order. All three source documents are encrypted, contain one page each, and open without an opening password.

Each corrected page was rendered and visually compared with its corresponding original. All three preserve the original page dimensions and visible content. The prior output renders all three pages completely white (zero non-white pixels); the corrected pages contain approximately 6.38%, 8.18% and 7.09% non-white pixels. Mean per-channel pixel differences from the originals were approximately 3.14, 4.04 and 3.35 on a 0-255 scale, consistent with the raster compatibility path. The corrected file is 580,950 bytes, opens successfully, and all validation workers were destroyed.

The corrected download was saved beside the user's source files under a new name; the defective output and originals were preserved. No private source documents, outputs, screenshots or extracted contents were added to the repository or fixtures. Temporary comparison images were removed after visual inspection. This closes the previously pending original three-file regression.

## Final gate record

Independent final verification:

| Gate | Result |
| --- | --- |
| `bun x tsc -b` | Passed, exit 0 |
| `bun run lint` | Passed, exit 0; repeated after the last browser-test addition |
| `bun run test` | 59 passed, 0 failed, 514 assertions |
| `bun run build` | Passed: SEO generation, TypeScript, Vite production bundle and static pages |
| `bun run verify` | Passed, exit 0 |
| Chromium browser suite | 8 passed |
| Chrome browser suite | 8 passed |
| Edge browser suite | 8 passed |
| Full final browser matrix | 24 passed, 0 failed (approximately 1.1 minutes) |
| `git diff --check` | Passed |
| GitHub Actions | Configuration reviewed; not executed remotely |

The first local build attempts hit Windows sandbox `spawn EPERM`; the complete gate passed with approved local escalation. Bun installation also left some cached package files missing locally; those same locked dependency files were restored before successful validation. An intermediate browser run coincided with a Vite reload during the build and was invalidated; the final matrix ran after all production edits/build work and passed without retries.

The real Word worker is tested through the UI, and both synthetic source texts are checked in the downloaded DOCX. PDF UI downloads are reopened, normalized notices are accessible, and Spanish password errors are tested at a 390px mobile viewport. Safari was not available on this Windows machine.

No push, merge, deploy, publication or commit was performed. No private fixtures were added.


## Changed-file inventory

Final local `git status --short --untracked-files=all` (M = modified, ?? = new):

```text
 M .github/workflows/pr-quality.yml
 M .gitignore
 M AGENTS.md
 M bun.lock
 M package.json
 M src/features/document/OfficeToPdfBatchView.tsx
 M src/features/document/OfficeToPdfView.tsx
 M src/features/document/PdfDeletePagesView.tsx
 M src/features/document/PdfMergeView.tsx
 M src/features/document/PdfToOfficeView.tsx
 M src/features/document/hooks/useDocxMerger.ts
 M src/features/document/hooks/usePdfMerger.ts
 M src/features/document/hooks/usePdfPageRemover.ts
 M src/features/document/lib/officeArchiveLimits.ts
 M src/features/document/lib/officeToPdf.ts
 M src/features/document/lib/pdfToOffice.ts
 M src/features/document/workers/docxMerge.worker.ts
 M src/features/excel-join/ExcelJoinView.tsx
 M src/features/excel/ExcelColumnBuilderView.tsx
 M src/features/excel/lib/excelColumnBuilder.ts
 M src/features/image/lib/imageLimits.ts
 M src/i18n/messages.en.ts
 M src/i18n/messages.es.ts
 M tests/security-and-limits.test.ts
?? docs/file-compatibility.md
?? playwright.config.ts
?? scripts/generate-compatibility-fixtures.py
?? src/lib/fileCompatibility/compound.ts
?? src/lib/fileCompatibility/core.ts
?? src/lib/fileCompatibility/image.ts
?? src/lib/fileCompatibility/office.ts
?? src/lib/fileCompatibility/pdf.ts
?? src/lib/fileCompatibility/pdfRuntime.ts
?? tests/browser/harness.html
?? tests/browser/harness.tsx
?? tests/browser/helpers.ts
?? tests/browser/pdf-compatibility.spec.ts
?? tests/docx-lifecycle.test.ts
?? tests/file-compatibility.test.ts
?? tests/fixtures/compatibility/multipage.pdf
?? tests/fixtures/compatibility/normal.pdf
?? tests/fixtures/compatibility/password.pdf
?? tests/fixtures/compatibility/protected.pdf
```
