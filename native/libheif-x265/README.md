# libheif + x265 WASM backend

This folder contains the native bridge for the production HEIC encoder.

The web app can run without this backend: it exports a `.gainmap.json` debug package that includes the SDR base RGBA pixels, the Apple-style quarter-resolution gain map, XMP metadata, and encoder options. Once the backend is built, the same UI automatically loads `public/encoders/apple-hdr-heic.js` and exports `.heic`.

## Build

Run from WSL/Linux with Emscripten active:

```bash
cd hdr-heic-bypass
source ~/emsdk/emsdk_env.sh
bash scripts/build-libheif-x265-wasm.sh
npm run build
```

The script clones and builds:

- `x265` as a static Emscripten library
- `libheif` with the HEVC encoder enabled
- `apple_hdr_heic.cpp` as the JS/WASM bridge

## Compatibility note

The bridge encodes a primary HEIC image, a monochrome auxiliary gain map image, an `auxC` property using `urn:com:apple:photo:2020:aux:hdrgainmap`, an `auxl` item reference, and XMP HDR gain map metadata. This follows the structure required by Apple-style HDR gain maps, but macOS Photos/Preview validation still needs to be performed with real output samples.

## License note

`libheif` is LGPL. `x265` is GPL and HEVC may carry patent/licensing obligations depending on how and where the app is distributed. Keep the encoder build optional if this project is published publicly.
