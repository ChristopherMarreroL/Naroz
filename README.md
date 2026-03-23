# Naroz

Naroz is a browser-first toolkit for converting, merging, extracting, and trimming media and documents locally.

The app is built with React, Vite, TypeScript, and Tailwind CSS, and keeps processing on the client side whenever possible.

## Current Tools

- Video
  - Merge multiple `MP4` or `MKV` files
  - Reorder videos before merging
  - Automatic fast vs compatible merge route detection
  - Convert one video between `MP4` and `MKV`
  - Extract audio from one video to `MP3` or `WAV`
  - Trim one video segment with timeline preview
- Images
  - Convert images between `JPG`, `PNG`, `WebP`, `AVIF`, `GIF`, and `ICO`
- Documents
  - Merge multiple `PDF` files into one final PDF
  - Merge multiple `DOCX` files into one final Word document (`beta`)

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
- `docx-merger` for DOCX merging
- `gifenc` for GIF image export

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
- Video trimming currently runs as a first beta version and may vary depending on codec/container combinations.
- DOCX merging is currently marked as beta for complex Word documents with advanced formatting.
- Some image export formats such as `AVIF` or `WebP` may depend on browser or device support.
- If the browser cannot generate the requested format correctly, Naroz shows an error instead of downloading an invalid file.

## Repository

`https://github.com/ChristopherMarreroL/Naroz`
