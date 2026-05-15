#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPS_DIR="${ROOT_DIR}/.deps"
BUILD_DIR="${ROOT_DIR}/.build/libheif-x265"
PUBLIC_ENCODER_DIR="${ROOT_DIR}/public/encoders"
NATIVE_DIR="${ROOT_DIR}/native/libheif-x265"

command -v emcc >/dev/null || {
  echo "emcc not found. Activate Emscripten first, for example: source ~/emsdk/emsdk_env.sh" >&2
  exit 1
}
command -v cmake >/dev/null || { echo "cmake not found" >&2; exit 1; }
command -v ninja >/dev/null || { echo "ninja not found" >&2; exit 1; }

mkdir -p "${DEPS_DIR}" "${BUILD_DIR}" "${PUBLIC_ENCODER_DIR}"

if [ ! -d "${DEPS_DIR}/x265" ]; then
  git clone --depth 1 https://bitbucket.org/multicoreware/x265_git.git "${DEPS_DIR}/x265"
fi

X265_CMAKE="${DEPS_DIR}/x265/source/CMakeLists.txt"
if ! grep -q "Codex wasm32 override" "${X265_CMAKE}"; then
  perl -0pi -e 's/(else\(\)\n    string\(TOLOWER "\$\{CMAKE_SYSTEM_PROCESSOR\}" SYSPROC\)\nendif\(\)\n)/$1if(CMAKE_SYSTEM_NAME STREQUAL "Emscripten") # Codex wasm32 override\n    set(SYSPROC wasm32)\nendif()\n/' "${X265_CMAKE}"
fi

X265_ENCODER_CPP="${DEPS_DIR}/x265/source/encoder/encoder.cpp"
if ! grep -q "Codex Emscripten synchronous frame encoder" "${X265_ENCODER_CPP}"; then
  perl -0pi -e 's/(\s+for \(int i = 0; i < m_param->frameNumThreads; i\+\+\)\n\s+\{\n\s+)m_frameEncoder\[i\]->start\(\);\n\s+m_frameEncoder\[i\]->m_done\.wait\(\); \/\* wait for thread to initialize \*\/\n\s+\}/$1#ifndef __EMSCRIPTEN__\n        m_frameEncoder[i]->start();\n        m_frameEncoder[i]->m_done.wait(); \/* wait for thread to initialize *\/\n#else\n        \/* Codex Emscripten synchronous frame encoder: no pthread worker is available in the browser build. *\/\n#endif\n    }/' "${X265_ENCODER_CPP}"
fi

X265_FRAMEENCODER_CPP="${DEPS_DIR}/x265/source/encoder/frameencoder.cpp"
if ! grep -q "Codex Emscripten synchronous compress" "${X265_FRAMEENCODER_CPP}"; then
  perl -0pi -e 's/(\n    if \(!m_cuGeoms\)\n    \{\n        if \(!initializeGeoms\(\)\)\n            return false;\n    \}\n\n)    m_enable\.trigger\(\);\n    return true;\n/$1#ifdef __EMSCRIPTEN__\n    \/* Codex Emscripten synchronous compress: avoid waiting on an unstarted FrameEncoder thread. *\/\n    if (!m_tld)\n    {\n        m_tld = new ThreadLocalData;\n        m_tld->analysis.initSearch(*m_param, m_top->m_scalingList);\n        m_tld->analysis.create(NULL);\n        m_localTldIdx = 0;\n    }\n    for (int layer = 0; layer < m_param->numLayers; layer++)\n        compressFrame(layer);\n    m_done.trigger();\n#else\n    m_enable.trigger();\n#endif\n    return true;\n/' "${X265_FRAMEENCODER_CPP}"
fi
if grep -q "Codex Emscripten synchronous compress" "${X265_FRAMEENCODER_CPP}" && ! grep -q "if (!m_tld)" "${X265_FRAMEENCODER_CPP}"; then
  perl -0pi -e 's/(#ifdef __EMSCRIPTEN__\n    \/\* Codex Emscripten synchronous compress: avoid waiting on an unstarted FrameEncoder thread\. \*\/\n)/$1    if (!m_tld)\n    {\n        m_tld = new ThreadLocalData;\n        m_tld->analysis.initSearch(*m_param, m_top->m_scalingList);\n        m_tld->analysis.create(NULL);\n        m_localTldIdx = 0;\n    }\n/' "${X265_FRAMEENCODER_CPP}"
fi

if [ ! -d "${DEPS_DIR}/libheif" ]; then
  git clone --depth 1 https://github.com/strukturag/libheif.git "${DEPS_DIR}/libheif"
fi

X265_BUILD="${BUILD_DIR}/x265"
mkdir -p "${X265_BUILD}"
emcmake cmake -S "${DEPS_DIR}/x265/source" -B "${X265_BUILD}" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_SYSTEM_PROCESSOR=wasm32 \
  -DENABLE_SHARED=OFF \
  -DENABLE_CLI=OFF \
  -DENABLE_ASSEMBLY=OFF \
  -DENABLE_PIC=OFF
cmake --build "${X265_BUILD}"
cp "${X265_BUILD}/x265_config.h" "${DEPS_DIR}/x265/source/x265_config.h"

LIBHEIF_BUILD="${BUILD_DIR}/libheif"
mkdir -p "${LIBHEIF_BUILD}"
emcmake cmake -S "${DEPS_DIR}/libheif" -B "${LIBHEIF_BUILD}" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_TESTING=OFF \
  -DBUILD_SHARED_LIBS=OFF \
  -DENABLE_PLUGIN_LOADING=OFF \
  -DWITH_EXAMPLES=OFF \
  -DWITH_LIBDE265=OFF \
  -DWITH_X265=ON \
  -DWITH_X265_PLUGIN=OFF \
  -DWITH_AOM_DECODER=OFF \
  -DWITH_AOM_ENCODER=OFF \
  -DWITH_DAV1D=OFF \
  -DWITH_RAV1E=OFF \
  -DWITH_SvtEnc=OFF \
  -DWITH_JPEG_DECODER=OFF \
  -DWITH_JPEG_ENCODER=OFF \
  -DWITH_KVAZAAR=OFF \
  -DWITH_OpenJPEG_DECODER=OFF \
  -DWITH_OpenJPEG_ENCODER=OFF \
  -DCMAKE_PREFIX_PATH="${X265_BUILD}" \
  -DX265_INCLUDE_DIR="${DEPS_DIR}/x265/source" \
  -DX265_LIBRARY="${X265_BUILD}/libx265.a"
cmake --build "${LIBHEIF_BUILD}"

em++ "${NATIVE_DIR}/apple_hdr_heic.cpp" \
  -I"${DEPS_DIR}/libheif/libheif/api" \
  -I"${LIBHEIF_BUILD}" \
  "${LIBHEIF_BUILD}/libheif/libheif.a" \
  "${X265_BUILD}/libx265.a" \
  -O3 \
  --bind \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ENVIRONMENT=web,worker \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORTED_FUNCTIONS='["_malloc","_free","_encode_apple_hdr_heic","_free_encoded_buffer"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","HEAPU8"]' \
  -o "${PUBLIC_ENCODER_DIR}/apple-hdr-heic.js"

echo "Wrote ${PUBLIC_ENCODER_DIR}/apple-hdr-heic.js and apple-hdr-heic.wasm"
