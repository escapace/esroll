import { describe, expect, it } from 'vitest'
import { normalizeCommonPathPrefixInput } from './normalize-common-path-prefix-input'

describe('normalizeCommonPathPrefixInput', () => {
  it('strips leading dot-slash segments', () => {
    expect(normalizeCommonPathPrefixInput('./src/index.ts')).toBe('src/index.ts')
    expect(normalizeCommonPathPrefixInput('././src/index.ts')).toBe('src/index.ts')
    expect(normalizeCommonPathPrefixInput('src/index.ts')).toBe('src/index.ts')
  })

  it('normalizes windows separators', () => {
    expect(normalizeCommonPathPrefixInput('.\\src\\index.ts')).toBe('src/index.ts')
    expect(normalizeCommonPathPrefixInput('src\\index.ts')).toBe('src/index.ts')
  })

  it('does not strip parent segments', () => {
    expect(normalizeCommonPathPrefixInput('../src/index.ts')).toBe('../src/index.ts')
    expect(normalizeCommonPathPrefixInput('..\\src\\index.ts')).toBe('../src/index.ts')
  })
})
