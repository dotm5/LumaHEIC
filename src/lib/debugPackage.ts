import type { BypassOptions, GainMapResult } from './gainMap'
import { buildDebugManifest } from './metadata'

type DebugPackageInput = {
  sourceName: string
  result: GainMapResult
  options: BypassOptions
}

export function createDebugPackage({ sourceName, result, options }: DebugPackageInput) {
  const payload = {
    manifest: buildDebugManifest(options, sourceName),
    image: {
      width: result.base.width,
      height: result.base.height,
      rgbaBase: Array.from(result.base.data),
    },
    gainMap: {
      width: result.gainMap.width,
      height: result.gainMap.height,
      encodedLuma: Array.from(result.gainMap.data),
    },
    stats: result.stats,
  }

  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
}
