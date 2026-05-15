export type GainMapResolutionMode =
  | 'auto'
  | '480p'
  | '720p'
  | '1080p'
  | 'quarter'
  | 'half'
  | 'full'
  | 'custom'

export type InputMode = 'single-image-enhance' | 'base-plus-gain-map'

export type PresetId = 'natural' | 'bright' | 'extreme'

export type PresetSelection = PresetId | 'custom'

export type BypassOptions = {
  headroom: number
  strength: number
  exposure: number
  highlights: number
  whites: number
  shadows: number
  blacks: number
  highlightStart: number
  highlightEnd: number
  shadowProtect: number
  saturationProtect: number
  skinProtect: number
  glow: number
  edgeSmoothRadius: number
  smallHighlightPreserve: number
  gainMapResolutionMode: GainMapResolutionMode
  customGainMapWidth?: number
  customGainMapHeight?: number
}

export const defaultPresetId: PresetId = 'natural'

export const hdrPresets: Record<PresetId, BypassOptions> = {
  natural: {
    headroom: 3.0,
    strength: 0.65,
    exposure: 0.0,
    highlights: 0.45,
    whites: 0.35,
    shadows: 0.0,
    blacks: 0.0,
    highlightStart: 0.68,
    highlightEnd: 0.96,
    shadowProtect: 0.75,
    saturationProtect: 0.55,
    skinProtect: 0.65,
    glow: 0.25,
    edgeSmoothRadius: 12,
    smallHighlightPreserve: 0.35,
    gainMapResolutionMode: 'auto',
  },
  bright: {
    headroom: 4.0,
    strength: 0.8,
    exposure: 0.0,
    highlights: 0.58,
    whites: 0.48,
    shadows: 0.0,
    blacks: 0.0,
    highlightStart: 0.62,
    highlightEnd: 0.94,
    shadowProtect: 0.7,
    saturationProtect: 0.5,
    skinProtect: 0.6,
    glow: 0.32,
    edgeSmoothRadius: 14,
    smallHighlightPreserve: 0.45,
    gainMapResolutionMode: 'auto',
  },
  extreme: {
    headroom: 6.0,
    strength: 1.0,
    exposure: 0.0,
    highlights: 0.8,
    whites: 0.72,
    shadows: 0.08,
    blacks: 0.0,
    highlightStart: 0.48,
    highlightEnd: 0.9,
    shadowProtect: 0.55,
    saturationProtect: 0.35,
    skinProtect: 0.45,
    glow: 0.45,
    edgeSmoothRadius: 18,
    smallHighlightPreserve: 0.65,
    gainMapResolutionMode: 'auto',
  },
}

export const defaultBypassOptions: BypassOptions = hdrPresets[defaultPresetId]

export const gainMapResolutionModes: GainMapResolutionMode[] = [
  'auto',
  '480p',
  '720p',
  '1080p',
  'quarter',
  'half',
  'full',
  'custom',
]
