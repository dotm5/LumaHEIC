import type { BypassOptions } from './gainMap'
import { getAppleMakerNote48 } from './gainMap'

export const APPLE_HDR_GAIN_MAP_URN = 'urn:com:apple:photo:2020:aux:hdrgainmap'

export function buildAppleGainMapXmp(options: BypassOptions) {
  return [
    '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="LumaHEIC">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:HDRGainMap="http://ns.apple.com/HDRGainMap/1.0/">',
    '<HDRGainMap:HDRGainMapVersion>131072</HDRGainMap:HDRGainMapVersion>',
    `<HDRGainMap:HDRGainMapHeadroom>${options.headroomStops.toFixed(6)}</HDRGainMap:HDRGainMapHeadroom>`,
    '</rdf:Description>',
    '</rdf:RDF>',
    '</x:xmpmeta>',
  ].join('')
}

export function buildDebugManifest(options: BypassOptions, inputName: string) {
  return {
    kind: 'hdr-gain-map-debug-package',
    version: 1,
    inputName,
    auxiliaryType: APPLE_HDR_GAIN_MAP_URN,
    controls: options,
    derived: {
      headroom: Math.pow(2, options.headroomStops),
    },
    appleMakerNote: {
      '33': 1.0,
      '48': getAppleMakerNote48(Math.pow(2, options.headroomStops)),
    },
    xmp: buildAppleGainMapXmp(options),
  }
}
