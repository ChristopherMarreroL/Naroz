# Naroz

Naroz is a browser-first toolkit for converting, merging, extracting, and trimming media and documents locally.

The app is built with React, Vite, TypeScript, and Tailwind CSS, and keeps processing on the client side whenever possible.

## Current Tools

- Video
  - Merge multiple `MP4`, `MKV`, or `MOV` files
  - Reorder videos before merging
  - Automatic fast vs compatible merge route detection
  - Convert one video between `MP4`, `MKV`, and `MOV`
  - Extract audio from one `MP4`, `MKV`, or `MOV` video to `MP3` or `WAV`
  - Remove audio from one video while keeping the original container
  - Trim one video segment with timeline preview
  - Resize one video with common resolution presets
  - Change video playback speed
- Images
  - Convert images between `JPG`, `PNG`, `WebP`, `AVIF`, `GIF`, and `ICO`
  - Convert multiple images in one batch with direct downloads or ZIP export
  - Crop images in the browser
  - Rotate and flip images
  - Remove image backgrounds (`beta`)
- Documents
  - Merge multiple `PDF` files into one final PDF
  - Delete selected pages from one PDF (`beta`)
  - Merge multiple `DOCX` files into one final Word document (`beta`)
  - Convert `.MSG` or `.EML` emails to PDF through the browser print flow (`beta`)

## UX Highlights

- Spanish and English UI with in-app language switching
- Drag and drop file upload across the main tools
- In-browser processing progress feedback
- Session-level state persistence when switching between tools in the same tab
- Responsive layout for desktop and mobile

## Tech Stack

- React
- Vite
- TypeScript
- Tailwind CSS
- `ffmpeg.wasm` for in-browser video processing
- `pdf-lib` for PDF merging
- `pdfjs-dist` for PDF page previews
- `docx-merger` for DOCX merging
- `gifenc` for GIF image export
- `jszip` for batch image ZIP downloads
- `@imgly/background-removal` and `onnxruntime-web` for local image background removal
- `@kenjiuno/msgreader` and `postal-mime` for email parsing

## Setup

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Run lint:

```bash
npm run lint
```

## Environment

You can define the public site URL for SEO metadata and generated files:

```bash
VITE_SITE_URL=https://your-domain.com
```

Use `.env.example` as a reference.

## Generated SEO Files

The build process generates:

- `public/robots.txt`
- `public/sitemap.xml`

Base metadata and dynamic head updates are handled in:

- `index.html`
- `src/lib/seo.ts`
- `src/components/shared/SeoHead.tsx`

## Project Structure

```text
src/
  components/
    layout/
    shared/
  features/
    document/
    home/
    image/
    shared/
    video/
  i18n/
  lib/
  types/
```

## Notes

- Video merging works best when files share compatible codecs and resolution.
- Naroz automatically chooses between a faster merge route and a more compatible route.
- `MOV` is supported for iPhone-style video workflows. Modern Android video is usually already `MP4`; older `3GP` files are not currently included.
- Video trimming currently runs as a first beta version and may vary depending on codec/container combinations.
- DOCX merging is currently marked as beta for complex Word documents with advanced formatting.
- Email-to-PDF uses the browser print/save PDF flow because it preserves remote images and selectable text more reliably than canvas-based PDF export.
- Some image export formats such as `AVIF` or `WebP` may depend on browser or device support.
- If the browser cannot generate the requested format correctly, Naroz shows an error instead of downloading an invalid file.

## Repository

`https://github.com/ChristopherMarreroL/Naroz`
