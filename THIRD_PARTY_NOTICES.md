# Third-party notices

This file summarizes the license-sensitive components bundled or linked by the LumaHEIC browser encoder. It is not a substitute for the upstream license texts.

## x265

- Path: `.deps/x265`
- License: GNU GPL version 2 or later, with a commercial proprietary license option from the x265 authors.
- Local license text: `.deps/x265/COPYING`
- Note: The browser HEIC encoder links x265 for HEVC encoding, so the distributed encoder bundle must be treated as GPL-covered unless a separate commercial license is obtained.

## libheif

- Path: `.deps/libheif`
- License: GNU LGPL for the library; some sample apps and language wrappers are MIT-licensed.
- Local license text: `.deps/libheif/COPYING`
- Note: The browser encoder links libheif as the HEIF container and metadata layer.

## HEVC

HEVC may be covered by patent licensing obligations. Review patent and platform distribution requirements before distributing the encoder bundle or a hosted application that performs HEVC encoding.
