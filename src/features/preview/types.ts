import type { GainMapResult } from '../../lib/gainMap'

export type UiGainMapResult = Omit<GainMapResult, 'gainMap'> & {
  gainMap: Pick<GainMapResult['gainMap'], 'width' | 'height'>
}
