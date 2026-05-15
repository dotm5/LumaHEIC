# HDR HEIC Bypass

Browser-first prototype for converting a single JPEG/PNG into a macOS-friendly Apple HDR gain map HEIC.

The project refactors the Swift/CoreImage/Metal flow from [`toGainMapHDR`](https://github.com/chemharuka/toGainMapHDR) into portable layers:

- `crates/bypass-core`: Rust implementation of the single-image gain map math.
- `src/lib/gainMap.ts`: TypeScript fallback using the same formulas for fast local UI work.
- `src/workers/bypassWorker.ts`: Web Worker pipeline for preview generation and encoding.
- `native/libheif-x265`: Emscripten bridge for the optional `libheif + x265` HEIC backend.

## Current behavior

1. Upload a JPEG or PNG.
2. Adjust HDR strength, highlight threshold, transition softness, peak headroom, and color protection.
3. Preview the SDR base, generated gain map, and HDR reference.
4. Export:
   - If `public/encoders/apple-hdr-heic.js` exists, export `.heic`.
   - Otherwise export `.gainmap.json` with all data needed to validate the algorithm and feed the native encoder.

The bypass mode synthesizes an HDR look from a single SDR input. It does not recover true scene HDR information.

## Local development

```bash
npm install
npm run dev
npm test
npm run build
```

## Build the HEIC encoder

Use WSL/Linux with Emscripten, CMake, Ninja, and Git:

```bash
source ~/emsdk/emsdk_env.sh
bash scripts/build-libheif-x265-wasm.sh
npm run build
```

The encoder output is written to `public/encoders/` and loaded relative to `import.meta.env.BASE_URL`, so GitHub Pages subpaths work.

## WASM backend mode

For local server-side WASM encoding, build the encoder and frontend in backend mode:

```bash
npm run build:wasm
npm run serve:wasm
```

Then open:

```text
http://127.0.0.1:8787
```

In this mode the page posts generated base pixels and gain-map pixels to `/api/encode-heic`. The Node backend loads `public/encoders/apple-hdr-heic.js` and `apple-hdr-heic.wasm`, runs the same `libheif + x265` WASM encoder, and returns `image/heic`.

Useful checks:

```bash
curl http://127.0.0.1:8787/api/health
heif-info .build/debug-output/backend-api-smoke.heic
```

## GitHub Pages

Set `VITE_BASE_PATH` to the repository path:

```bash
VITE_BASE_PATH=/hdr-heic-bypass/ npm run build
```

## License and distribution

This app code is MIT-compatible prototype code. The optional HEIC backend links `libheif` and `x265`; `x265` is GPL, and HEVC may have patent/licensing obligations. Keep that backend optional or review distribution requirements before publishing.
