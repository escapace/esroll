import type { OutputAsset, OutputChunk } from 'rollup'

export const scoreFile = (value: OutputAsset | OutputChunk | undefined) => {
  if (value === undefined) {
    return 0
  } else if (value.type === 'asset') {
    return 1
  } else {
    let score = 2

    if (value.isEntry) {
      score = score + 1
    }

    return score
  }
}
