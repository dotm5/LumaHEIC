# LumaHEIC

<p align="center">
  <img src="public/favicon.svg" alt="LumaHEIC icon" width="96" height="96">
</p>

[![Deploy GitHub Pages](https://github.com/dotm5/LumaHEIC/actions/workflows/pages.yml/badge.svg)](https://github.com/dotm5/LumaHEIC/actions/workflows/pages.yml)
[![License: GPL v2 or later](https://img.shields.io/badge/License-GPL_v2_or_later-blue.svg)](LICENSE)

**Language:** English | [简体中文](README_CN.md)

LumaHEIC is a browser-only Apple HDR gain-map HEIC exporter for turning SDR images into Photos-friendly HEIC files with an Apple HDR gain-map auxiliary image.

The app is designed for static hosting. GitHub Pages serves only HTML, CSS, JavaScript, and WASM files. Images are never uploaded to any server: decoding, gain-map generation, preview rendering, and HEIC encoding all run locally in the user's browser, inside a Web Worker and the `libheif + x265` WASM encoder.

## What it does

- Builds an Apple-style HDR gain map from one SDR source image.
- Authors HEIC from an SDR base image plus an uploaded grayscale gain map.
- Exports `.heic` in the browser through the bundled WASM encoder.
- Writes the Apple HDR gain-map auxiliary image, XMP metadata, and MakerApple HDR metadata paths used by the native encoder.
- Provides English and Chinese UI text.
- Keeps GitHub Pages deployment fully static, with no backend API and no upload path.

The generated HDR look is synthetic. LumaHEIC does not recover true scene HDR information that was not present in the source image.

## Authoring modes

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

After choosing a preset, every parameter remains editable. A manual edit moves the UI into a custom preset state.

## Gain-map resolution

The gain-map auxiliary image can be generated at different resolutions:

- **Auto**: half size for images up to 1200 px long edge, 720 px long edge up to 3000 px, 1080 px up to 6000 px, and 1440 px above that.
- **480p / 720p / 1080p**: cap the gain-map long edge to that size.
- **Quarter / Half / Full**: use a fixed fraction of the base dimensions or the full base size.
- **Custom**: type is reserved for a future UI.

All modes preserve aspect ratio, keep dimensions at least 1 px, and do not exceed the base image dimensions. Sparse highlights use a mixed average/max downsample path so small bright points are not fully averaged away.

## Documentation

### Try it

The current GitHub Pages deployment is:

```text
https://dotm5.github.io/LumaHEIC/
```

The repository path is `LumaHEIC`; keep `VITE_BASE_PATH` and the Pages workflow aligned with that slug so the static WASM encoder assets load correctly.

### Local development

```bash
npm install
npm run dev
npm test
npm run build
```

### Build the browser HEIC encoder

Use WSL/Linux with Emscripten, CMake, Ninja, and Git:

```bash
source ~/emsdk/emsdk_env.sh
bash scripts/build-libheif-x265-wasm.sh
npm run build
```

The encoder output is written to `public/encoders/` and loaded relative to `import.meta.env.BASE_URL`, so GitHub Pages subpaths work.

### GitHub Pages

For the current repository slug:

```bash
VITE_BASE_PATH=/LumaHEIC/ npm run build
```

GitHub Pages remains a static deployment. There is no `/api/encode-heic` route and no server-side encoding path.

## How to verify exported HEIC

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

## Project layout

- `src/`: React UI, local gain-map preview logic, i18n, and Web Worker integration.
- `src/workers/bypassWorker.ts`: browser-only preview and HEIC export pipeline.
- `native/libheif-x265/`: Emscripten bridge for the browser WASM HEIC encoder.
- `public/encoders/apple-hdr-heic.js`: static WASM loader served by the browser.
- `public/encoders/apple-hdr-heic.wasm`: static browser encoder module.
- `scripts/check-heic-hdr.sh`: local HEIC metadata and auxiliary-image validation helper.

The project refactors the Swift/CoreImage/Metal flow from [`toGainMapHDR`](https://github.com/chemharuka/toGainMapHDR) into portable browser layers.

## Terms and license

This repository is distributed under the GNU General Public License version 2 or later. See [LICENSE](LICENSE).

The published browser HEIC encoder links `x265`, which is GPL v2 or later and is also available from its authors under a commercial proprietary license. It also links `libheif`, whose library code is LGPL. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled encoder dependency notes.

HEVC encoding and distribution may involve patent or platform licensing obligations depending on where and how the app is distributed. This repository does not grant patent rights and this README is not legal advice.
