# LumaHEIC libheif + x265 browser WASM encoder

This folder contains the native bridge for the production browser-only HEIC encoder.

The web app does not call a server-side encoder. Once this WASM module is built, the UI loads `public/encoders/apple-hdr-heic.js` and `public/encoders/apple-hdr-heic.wasm` inside the browser worker and exports `.heic`. If those files are missing, export is unavailable.

## Build

Run from WSL/Linux with Emscripten active:

```bash
cd luma-heic
source ~/emsdk/emsdk_env.sh
bash scripts/build-libheif-x265-wasm.sh
npm run build
```

The script clones and builds:

- `x265` as a static Emscripten library
- `libheif` with the HEVC encoder enabled
- `apple_hdr_heic.cpp` as the JS/WASM bridge

## Compatibility note

The bridge encodes a primary HEIC image, a monochrome auxiliary gain map image, an `auxC` property using `urn:com:apple:photo:2020:aux:hdrgainmap`, an `auxl` item reference from the gain-map item to the primary item, Apple HDR gain map XMP metadata, and best-effort Apple MakerNote `HDRHeadroom` / `HDRGain` EXIF metadata. This follows the structure seen in Apple-style HDR gain maps, but macOS Photos / iOS Photos validation still needs to be performed with real output samples.

## License note

`libheif` is LGPL. `x265` is GPL v2 or later and is also available from its authors under a commercial proprietary license. HEVC may carry patent/licensing obligations depending on how and where the app is distributed. Review distribution requirements before publishing the browser WASM encoder.
