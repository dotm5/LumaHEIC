# LumaHEIC

<p align="center">
  <img src="public/favicon.svg" alt="LumaHEIC icon" width="96" height="96">
</p>

[![Deploy GitHub Pages](https://github.com/dotm5/LumaHEIC/actions/workflows/pages.yml/badge.svg)](https://github.com/dotm5/LumaHEIC/actions/workflows/pages.yml)
[![License: GPL v2 or later](https://img.shields.io/badge/License-GPL_v2_or_later-blue.svg)](LICENSE)

**Language:** English | [简体中文](README_CN.md)

LumaHEIC is an open-source, browser-only Apple HDR gain-map HEIC authoring and debugging tool. It converts ordinary SDR images, or custom SDR base + gain-map pairs, into Apple Photos-friendly HDR HEIC files.

Instead of hiding the result behind a single "HDR strength" slider, LumaHEIC exposes the controls that matter for HDR gain-map authoring: headroom, HDR strength, highlight response, protection strength, gain-map resolution, gain-map preview, HDR reference preview, and exported HEIC metadata checks.

Everything runs locally in the browser. Images are never uploaded to any server: decoding, gain-map generation, preview rendering, and HEIC encoding run inside a Web Worker and a `libheif + x265` WASM encoder.

Try it online: [https://dotm5.github.io/LumaHEIC/](https://dotm5.github.io/LumaHEIC/)

Goal: make Apple HDR / EDR image authoring transparent, controllable, debuggable, and reproducible.

The generated HDR look is synthetic. LumaHEIC does not recover true scene HDR information that was not present in the source image.

## Why LumaHEIC?

Apple devices can display HDR / EDR photos with a gain-map-based workflow, but producing an Apple Photos-recognized HDR HEIC is still difficult to inspect. Many image tools are designed around a compact one-click experience, where the user sees a final look but not the gain-map resolution, headroom, auxiliary image, XMP metadata, or HEIF item references behind it.

LumaHEIC focuses on an open Apple HDR gain-map workflow. It is useful when you want to understand what is being generated, tune the inputs, export a HEIC, and then verify how the file is wired.

- Open source
- No watermark
- No server upload path
- Browser-only static deployment
- Single-image synthetic gain-map generation
- Base + Gain Map authoring
- Adjustable gain-map resolution
- Presets plus manual controls
- HEIC metadata and auxiliary-image validation

## Core Features

### 1. Generate Apple HDR HEIC from SDR images

Start with one JPEG or PNG. LumaHEIC builds a synthetic Apple-style HDR gain map in the browser, previews the SDR base / gain map / HDR reference, and exports a HEIC that Apple Photos can recognize as an HDR gain-map image.

### 2. Author HEIC from Base + Gain Map

Use an SDR base image plus a grayscale gain map that you created elsewhere. This mode is intended for controlled authoring, format experiments, and debugging base + gain-map pipelines.

### 3. Tune HDR parameters instead of using only one strength slider

Presets are available, but the workflow remains editable. You can adjust headroom, HDR strength, exposure, highlights, whites, shadow protection, saturation protection, skin protection, glow, edge smoothing, small-highlight preservation, and gain-map resolution.

### 4. Local processing, no server upload

The app is designed for static hosting. GitHub Pages serves only HTML, CSS, JavaScript, and WASM files. There is no backend API and no `/api/encode-heic` route.

### 5. Verify exported HEIC files

LumaHEIC writes an Apple HDR gain-map auxiliary image, XMP metadata, and MakerApple HDR metadata paths used by the native encoder. The repository includes a local verification script for checking the auxiliary image, metadata, and HEIF item references after export.

## Who is this for?

- Users who want to convert ordinary images into Apple Photos HDR HEIC files.
- Creators and photography/color users who want more control than a one-click HDR filter.
- Apple HDR / EDR researchers studying gain maps and HEIF auxiliary images.
- Image-processing developers debugging base + gain-map workflows.
- Format-debugging users who want to inspect XMP metadata, auxiliary images, and HEIC item references.
- Users who want local processing without uploading private images.

## Try It

The current GitHub Pages deployment is:

```text
https://dotm5.github.io/LumaHEIC/
```

The repository path is `LumaHEIC`; keep `VITE_BASE_PATH` and the Pages workflow aligned with that slug so the static WASM encoder assets load correctly.

## Authoring Modes

### Single Image Enhance

Use one JPEG or PNG as the SDR base. The browser generates a synthetic HDR gain map locally, previews the SDR base / gain map / HDR reference, and sends the base plus 8-bit gain-map luma to the WASM `libheif + x265` encoder.

### Base + Gain Map

Use one SDR base JPEG/PNG and one grayscale gain map JPEG/PNG. Black is interpreted as `1x` gain, white is interpreted as the selected max headroom, and middle values use log2 gain encoding:

```text
encoded = log2(gain) / log2(maxHeadroom)
gain = maxHeadroom ^ encoded
```

This mode currently covers Base + Gain Map authoring only. Base + HDR Target authoring is a roadmap item.

## Presets

The default preset is **Natural**. It is conservative for general photography: moderate headroom, moderate HDR strength, strong protection, and automatic gain-map resolution.

- **Natural**: balanced, low-risk synthetic HDR for general photos.
- **Bright**: stronger highlights and headroom, still suitable for normal images.
- **Extreme**: exaggerated output intended for stress testing or stylized results.

Presets are starting points, not locked modes. After choosing a preset, every parameter remains editable. A manual edit moves the UI into a custom preset state.

## Gain-map Resolution

Gain-map resolution is one of the most important controls when authoring and debugging HDR HEIC output. LumaHEIC lets you choose how much detail the auxiliary image keeps instead of treating the gain map as an invisible implementation detail.

The gain-map auxiliary image can be generated at different resolutions:

- **Auto**: half size for images up to 1200 px long edge, 720 px long edge up to 3000 px, 1080 px up to 6000 px, and 1440 px above that.
- **480p / 720p / 1080p**: cap the gain-map long edge to that size.
- **Quarter / Half / Full**: use a fixed fraction of the base dimensions or the full base size.
- **Custom**: reserved in the data model and currently shown as a disabled TODO in the UI.

All active modes preserve aspect ratio, keep dimensions at least 1 px, and do not exceed the base image dimensions. Sparse highlights use a mixed average/max downsample path so small bright points are not fully averaged away.

## Local Development

```bash
npm install
npm run dev
npm test
npm run build
```

## Build the Browser HEIC Encoder

Use WSL/Linux with Emscripten, CMake, Ninja, and Git:

```bash
source ~/emsdk/emsdk_env.sh
bash scripts/build-libheif-x265-wasm.sh
npm run build
```

The encoder output is written to `public/encoders/` and loaded relative to `import.meta.env.BASE_URL`, so GitHub Pages subpaths work.

## GitHub Pages

For the current repository slug:

```bash
VITE_BASE_PATH=/LumaHEIC/ npm run build
```

GitHub Pages remains a static deployment. There is no backend API, no server-side encoding path, and no image upload path.

## How to Verify Exported HEIC

macOS Preview and Quick Look can depend on macOS version and are not always reliable validators for Apple HDR gain-map HEIC rendering. Prefer macOS Photos or iOS Photos for visual HDR validation.

For metadata and container checks, install the local tools and run:

```bash
brew install exiftool libheif
./scripts/check-heic-hdr.sh exported.heic
```

Useful signs in the output:

- `AuxiliaryImageType: urn:com:apple:photo:2020:aux:hdrgainmap`
- `HDRGainMapVersion`
- `HDRGainMapHeadroom`
- `auxC` with the Apple HDR gain-map URN
- `auxl` reference linking the auxiliary gain-map image item to the primary image item
- extracted auxiliary gain-map image from `heif-convert --with-aux`
- `MakerApple` / `Apple` `HDRHeadroom` and `HDRGain`, if the current WASM encoder build includes the MakerNote metadata path

Use the app's debug gain-map preview and metadata checks together when diagnosing whether an issue is gain-map content, HEIC auxiliary-image wiring, or platform rendering support.

## Project Layout

- `src/`: React UI, local gain-map preview logic, i18n, and Web Worker integration.
- `src/workers/bypassWorker.ts`: browser-only preview and HEIC export pipeline.
- `native/libheif-x265/`: Emscripten bridge for the browser WASM HEIC encoder.
- `public/encoders/apple-hdr-heic.js`: static WASM loader served by the browser.
- `public/encoders/apple-hdr-heic.wasm`: static browser encoder module.
- `scripts/check-heic-hdr.sh`: local HEIC metadata and auxiliary-image validation helper.

The project refactors the Swift/CoreImage/Metal flow from [`toGainMapHDR`](https://github.com/chemharuka/toGainMapHDR) into portable browser layers.

## Terms and License

This repository is distributed under the GNU General Public License version 2 or later. See [LICENSE](LICENSE).

The published browser HEIC encoder links `x265`, which is GPL v2 or later and is also available from its authors under a commercial proprietary license. It also links `libheif`, whose library code is LGPL. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled encoder dependency notes.

HEVC encoding and distribution may involve patent or platform licensing obligations depending on where and how the app is distributed. This repository does not grant patent rights and this README is not legal advice.
