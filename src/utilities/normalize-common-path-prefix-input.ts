export const normalizeCommonPathPrefixInput = (value: string): string => {
  let normalized = value.replace(/\\/g, '/')

  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }

  return normalized
}
