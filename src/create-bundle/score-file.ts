type ScoredFile = { type: 'asset' } | { type: 'chunk'; isEntry?: boolean }

export const scoreFile = (value: ScoredFile | undefined) => {
  if (value === undefined) {
    return 0
  } else if (value.type === 'asset') {
    return 1
  } else {
    let score = 2

    if (value.isEntry === true) {
      score = score + 1
    }

    return score
  }
}
