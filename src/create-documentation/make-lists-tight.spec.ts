import type { Root } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { describe, expect, it } from 'vitest'
import { makeListsTight } from './make-lists-tight'

const parse = (markdown: string): Root => fromMarkdown(markdown)

describe('makeListsTight', () => {
  it('converts loose unordered list to tight', () => {
    const input = parse('- Item 1\n\n- Item 2\n\n- Item 3\n')
    expect(makeListsTight(input.children)).toMatchSnapshot()
  })

  it('converts loose ordered list to tight', () => {
    const input = parse('1. First item\n\n2. Second item\n\n3. Third item\n')
    expect(makeListsTight(input.children)).toMatchSnapshot()
  })

  it('converts nested loose lists to tight', () => {
    const input = parse('- Outer 1\n\n  - Inner 1\n\n  - Inner 2\n\n- Outer 2\n')
    expect(makeListsTight(input.children)).toMatchSnapshot()
  })

  it('is idempotent', () => {
    const input = parse('- Item 1\n\n- Item 2\n\n- Item 3\n')
    const once = makeListsTight(input.children)
    const twice = makeListsTight(once)
    expect(once).toEqual(twice)
  })

  it('sets spread to false on nested List and ListItem nodes', () => {
    const input = parse('- Outer\n\n  - Inner 1\n\n  - Inner 2\n')
    const result = makeListsTight(input.children)

    const outerList = result.find((node) => node.type === 'list')!
    expect(outerList.spread).toBe(false)

    const firstItem = outerList.children[0]
    expect(firstItem.spread).toBe(false)

    const innerList = firstItem.children.find((node) => node.type === 'list')!
    expect(innerList).toBeDefined()
    expect(innerList.spread).toBe(false)

    for (const innerItem of innerList.children) {
      expect(innerItem.spread).toBe(false)
    }
  })
})
