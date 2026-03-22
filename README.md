# Naroz

Naroz is a modular multimedia web app built with React, Vite, TypeScript, and Tailwind CSS.

It runs directly in the browser and currently includes:

- Video tools
  - Merge multiple videos
  - Reorder videos before merging
  - Support for `MP4` and `MKV`
  - Select output format: `MP4` or `MKV`
- Image tools
  - Convert images between `JPG`, `PNG`, `WebP`, `AVIF`, `GIF`, and `ICO`

More tools will be added over time.

## Tech Stack

- React
- Vite
- TypeScript
- Tailwind CSS
- `ffmpeg.wasm` for in-browser video processing
- `gifenc` for GIF image export


## Install Dependencies

```bash
npm install
```

## Run in Development

```bash
npm run dev
```

Then open the local URL shown in the terminal.

## Build for Production

```bash
npm run build
```

## Preview the Production Build

```bash
npm run preview
```

## Lint the Project

```bash
npm run lint
```

## Project Structure

```text
src/
  components/
    layout/
    shared/
  features/
    home/
    image/
    video/
  lib/
  types/
```

## Notes

- Video merging works best when files share compatible codecs and resolution.
- When possible, Naroz uses a faster merge path without unnecessary conversion.
- Some image export formats such as `AVIF` or `WebP` may depend on browser/device support.
- If a browser cannot generate the requested format correctly, Naroz shows an error instead of downloading a fake file.

## Repository

`https://github.com/ChristopherMarreroL/Naroz`