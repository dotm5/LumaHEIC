# HDR HEIC Bypass

Browser-only prototype for converting a single JPEG/PNG into an Apple HDR gain-map HEIC.

The app is designed for static hosting. GitHub Pages serves only HTML, CSS, JavaScript, and WASM files. Images are never uploaded to a server: decoding, gain-map generation, preview rendering, and HEIC encoding all run locally in the user's browser, inside a Web Worker and the `libheif + x265` WASM encoder.

The project refactors the Swift/CoreImage/Metal flow from [`toGainMapHDR`](https://github.com/chemharuka/toGainMapHDR) into portable browser layers:

- `crates/bypass-core`: Rust implementation of the single-image gain map math.
- `src/lib/gainMap.ts`: TypeScript implementation used for local UI preview work.
- `src/workers/bypassWorker.ts`: Web Worker pipeline for preview generation and browser-side encoding.
- `native/libheif-x265`: Emscripten bridge for the browser WASM HEIC encoder.
- `public/encoders/apple-hdr-heic.js` and `public/encoders/apple-hdr-heic.wasm`: static encoder assets loaded by the browser.

## Current behavior

1. Upload a JPEG or PNG.
2. Adjust HDR strength, highlight threshold, transition softness, peak headroom, and color protection.
3. Preview the SDR base, generated gain map, and HDR reference.
4. Export `.heic` using the browser WASM encoder.

If the encoder files are missing or fail to load, the UI reports that the browser HEIC encoder is unavailable. The app does not fall back to a backend API and does not treat `.gainmap.json` as a successful default export.

The bypass mode synthesizes an HDR look from a single SDR input. It does not recover true scene HDR information.

## Local development

```bash
npm install
npm run dev
npm test
npm run build
```

## Build the browser HEIC encoder

Use WSL/Linux with Emscripten, CMake, Ninja, and Git:

```bash
source ~/emsdk/emsdk_env.sh
bash scripts/build-libheif-x265-wasm.sh
npm run build
```

The encoder output is written to `public/encoders/` and loaded relative to `import.meta.env.BASE_URL`, so GitHub Pages subpaths work.

## GitHub Pages

Set `VITE_BASE_PATH` to the repository path:

```bash
VITE_BASE_PATH=/hdr-heic-bypass/ npm run build
```

GitHub Pages remains a static deployment. There is no `/api/encode-heic` route and no server-side encoding path.

## How to verify exported HEIC

macOS Preview is not always a reliable validator for Apple HDR gain-map HEIC rendering. Prefer macOS Photos or iOS Photos for visual HDR validation.

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

## License and distribution

This app code is MIT-compatible prototype code. The browser HEIC encoder links `libheif` and `x265`; `x265` is GPL, and HEVC may have patent/licensing obligations. Review distribution requirements before publishing or redistributing the WASM encoder.
