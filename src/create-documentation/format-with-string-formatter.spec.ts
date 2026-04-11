import { describe, expect, it } from 'vitest'
import {
  formatWithStringFormatter,
  IntegrityError,
  type ProjectionAdapter,
} from './format-with-string-formatter'

type Item = { type: 'opaque'; value: string } | { type: 'text'; value: string }

const itemAdapter: ProjectionAdapter<Item[], string, undefined> = {
  fromSegments(options) {
    return options.segments.map((segment) =>
      segment.kind === 'text'
        ? { type: 'text', value: segment.value }
        : { type: 'opaque', value: segment.value },
    )
  },
  toSegments(source) {
    return {
      complement: undefined,
      segments: source.map((item) =>
        item.type === 'text'
          ? { kind: 'text', value: item.value }
          : { kind: 'opaque', value: item.value },
      ),
    }
  },
}

describe('formatWithStringFormatter', () => {
  it('preserves opaque identity and order while formatting text', () => {
    const source: Item[] = [
      { type: 'text', value: 'alpha  ' },
      { type: 'opaque', value: 'A' },
      { type: 'text', value: '  beta' },
      { type: 'opaque', value: 'B' },
      { type: 'text', value: '  gamma' },
    ]

    const result = formatWithStringFormatter({
      adapter: itemAdapter,
      source,
      format: (value) => value.replace(/ {2,}/g, ' '),
    })

    expect(result).toEqual([
      { type: 'text', value: 'alpha ' },
      { type: 'opaque', value: 'A' },
      { type: 'text', value: ' beta' },
      { type: 'opaque', value: 'B' },
      { type: 'text', value: ' gamma' },
    ])
  })

  it('returns original input when placeholder integrity is corrupted', () => {
    const source: Item[] = [
      { type: 'text', value: 'left ' },
      { type: 'opaque', value: 'A' },
      { type: 'text', value: ' right' },
    ]

    const result = formatWithStringFormatter({
      adapter: itemAdapter,
      source,
      format: (value) => value.replaceAll('\uE000', '').replaceAll('\uE001', ''),
    })

    expect(result).toBe(source)
  })

  it('throws IntegrityError in strict mode on placeholder corruption', () => {
    const source: Item[] = [
      { type: 'text', value: 'left ' },
      { type: 'opaque', value: 'A' },
      { type: 'text', value: ' right' },
    ]

    expect(() =>
      formatWithStringFormatter({
        adapter: itemAdapter,
        source,
        strict: true,
        format: (value) => value.replaceAll('\uE000', '').replaceAll('\uE001', ''),
      }),
    ).toThrow(IntegrityError)
  })

  it('returns original input when formatter throws', () => {
    const source: Item[] = [
      { type: 'text', value: 'x' },
      { type: 'opaque', value: 'A' },
    ]

    const result = formatWithStringFormatter({
      adapter: itemAdapter,
      source,
      format: () => {
        throw new Error('formatter failed')
      },
    })

    expect(result).toBe(source)
  })
})
