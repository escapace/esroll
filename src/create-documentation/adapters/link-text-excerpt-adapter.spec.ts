import type { Link, Text } from 'mdast'
import { describe, expect, it } from 'vitest'
import { linkTextExcerptAdapter } from './link-text-excerpt-adapter'

describe('linkTextExcerptAdapter', () => {
  it('projects text and link nodes to segments', () => {
    const nodes: Array<Link | Text> = [
      { type: 'text', value: 'before ' },
      {
        children: [
          { type: 'text', value: 'Snap\n' },
          { type: 'text', value: 'roll' },
        ],
        title: 'Snaproll',
        type: 'link',
        url: '#snaproll',
      },
      { type: 'text', value: ' after' },
    ]

    const result = linkTextExcerptAdapter.toSegments(nodes)

    expect(result.complement).toBeUndefined()
    expect(result.segments).toEqual([
      { kind: 'text', value: 'before ' },
      {
        kind: 'opaque',
        value: {
          text: 'Snap roll',
          title: 'Snaproll',
          url: '#snaproll',
        },
      },
      { kind: 'text', value: ' after' },
    ])
  })

  it('reconstructs text and link nodes from segments', () => {
    const result = linkTextExcerptAdapter.fromSegments({
      complement: undefined,
      segments: [
        { kind: 'text', value: 'before ' },
        {
          kind: 'opaque',
          value: {
            text: 'Snaproll',
            title: 'Snaproll',
            url: '#snaproll',
          },
        },
        { kind: 'text', value: ' after' },
      ],
    })

    expect(result).toEqual([
      { type: 'text', value: 'before ' },
      {
        children: [{ type: 'text', value: 'Snaproll' }],
        title: 'Snaproll',
        type: 'link',
        url: '#snaproll',
      },
      { type: 'text', value: ' after' },
    ])
  })

  it('satisfies adapter identity law for excerpt-style inputs', () => {
    const nodes: Array<Link | Text> = [
      { type: 'text', value: 'alpha ' },
      {
        children: [{ type: 'text', value: 'Snaproll' }],
        title: 'Snaproll',
        type: 'link',
        url: '#snaproll',
      },
      { type: 'text', value: ' beta' },
    ]

    const projected = linkTextExcerptAdapter.toSegments(nodes)
    const reconstructed = linkTextExcerptAdapter.fromSegments(projected)

    expect(reconstructed).toEqual(nodes)
  })
})
