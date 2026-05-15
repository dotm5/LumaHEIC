import type { BypassOptions } from './gainMap'
import { getAppleMakerNote48 } from './gainMap'

export const APPLE_HDR_GAIN_MAP_URN = 'urn:com:apple:photo:2020:aux:hdrgainmap'

export function buildAppleGainMapXmp(options: BypassOptions) {
  const headroomStops = Math.log2(Math.max(options.headroom, 1.05))
  return [
    '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="HDR HEIC Bypass">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:HDRGainMap="http://ns.apple.com/HDRGainMap/1.0/">',
    '<HDRGainMap:HDRGainMapVersion>131072</HDRGainMap:HDRGainMapVersion>',
    `<HDRGainMap:HDRGainMapHeadroom>${headroomStops.toFixed(6)}</HDRGainMap:HDRGainMapHeadroom>`,
    '</rdf:Description>',
    '</rdf:RDF>',
    '</x:xmpmeta>',
  ].join('')
}

export function buildDebugManifest(options: BypassOptions, inputName: string) {
  return {
    kind: 'apple-hdr-gain-map-debug-package',
    version: 1,
    inputName,
    auxiliaryType: APPLE_HDR_GAIN_MAP_URN,
    options,
    appleMakerNote: {
      '33': 1.0,
      '48': getAppleMakerNote48(options.headroom),
    },
    xmp: buildAppleGainMapXmp(options),
  }
}
