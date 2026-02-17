import { describe, expect, it } from 'vitest'
import {
  formatTypeScriptTypePresentation,
  normalizeExcerptBoundaryIndentation,
} from './typescript-type-presentation-formatter'

describe('normalizeExcerptBoundaryIndentation', () => {
  it('normalizes boundary whitespace and shared middle indentation', () => {
    const input =
      '\n\n      T extends Record<string, unknown>\n        ? Resolve<T>\n        : never      \n\n'

    expect(normalizeExcerptBoundaryIndentation(input)).toBe(
      'T extends Record<string, unknown>\n  ? Resolve<T>\n  : never',
    )
  })
})

describe('formatTypeScriptTypePresentation', () => {
  it('wraps long union types at safe breakpoints', () => {
    const input = 'type Result = Alpha | Beta | Gamma | Delta | Epsilon'
    const formatted = formatTypeScriptTypePresentation(input, { printWidth: 26 })

    expect(formatted).toContain('\n')
    expect(formatted).toContain('| Gamma')
    expect(formatted).toContain('| Epsilon')
  })

  it('wraps conditional types and preserves optional property markers', () => {
    const input = 'type Resolve<T> = T extends PromiseLike<infer U> ? Resolve<U> : { optional?: T }'
    const formatted = formatTypeScriptTypePresentation(input, { printWidth: 44 })

    expect(formatted).toContain('\n')
    expect(formatted).toContain(': { optional?: T }')
    expect(formatted).toContain('optional?: T')
  })

  it('keeps string and template literal payloads unchanged', () => {
    const input = "type Route = `/v1/${'user' | 'admin'}  /details`"

    expect(formatTypeScriptTypePresentation(input, { printWidth: 24 })).toBe(input)
  })

  it('treats placeholders as protected tokens', () => {
    const placeholder = '\uE000ESR:prefix:0:abc123\uE001'
    const input = `type Link = A | ${placeholder} | C | D`
    const formatted = formatTypeScriptTypePresentation(input, { printWidth: 18 })

    expect(formatted).toContain(placeholder)
    expect(formatted).toContain('\n')
  })

  it('falls back to phase-1 normalization when analysis is unsafe', () => {
    const input = '  type Broken = (A | B | C\n    | D  '

    expect(formatTypeScriptTypePresentation(input, { printWidth: 14 })).toBe(
      'type Broken = (A | B | C\n  | D',
    )
  })

  it('is idempotent for formatted excerpts', () => {
    const input = 'type Result = Alpha | Beta | Gamma | Delta | Epsilon'
    const once = formatTypeScriptTypePresentation(input, { printWidth: 26 })
    const twice = formatTypeScriptTypePresentation(once, { printWidth: 26 })

    expect(twice).toBe(once)
  })

  it('returns best tainted plan when all plans exceed computation width', () => {
    const input = 'type T = LeftBranch | RightBranch | ThirdBranch'

    expect(
      formatTypeScriptTypePresentation(input, {
        computationWidth: 5,
        printWidth: 12,
      }),
    ).toBe('type T = LeftBranch\n  | RightBranch\n  | ThirdBranch')
  })
})
