import { fromMarkdown } from 'mdast-util-from-markdown'
import { toMarkdown } from 'mdast-util-to-markdown'
import type { Root } from 'mdast'
import { describe, expect, it } from 'vitest'
import { replaceHeadingSection } from './replace-heading-section'

const parse = (markdown: string): Root => fromMarkdown(markdown)
const render = (root: Root): string => toMarkdown(root)

describe('replaceHeadingSection', () => {
  it('replaces a matching heading and its section', () => {
    const current = parse('# Heading\n\nOld content\n\n# Next\n\nNext body\n')
    const replacement = parse('# Heading\n\nNew content\n')

    replaceHeadingSection(current, replacement)

    expect(render(current)).toEqual('# Heading\n\nNew content\n\n# Next\n\nNext body\n')
  })

  it('replaces content until the next heading of same or higher level', () => {
    const current = parse(`# Heading

## Subheading

Sub content

# Next
`)

    const replacement = parse(`# Heading

Updated section
`)

    replaceHeadingSection(current, replacement)

    expect(render(current)).toEqual(`# Heading

Updated section

# Next
`)
  })

  it('appends the replacement when no matching heading exists', () => {
    const current = parse('# Existing\n\nBody\n')
    const replacement = parse('# New Section\n\nNew body\n')

    replaceHeadingSection(current, replacement)

    expect(render(current)).toEqual('# Existing\n\nBody\n\n# New Section\n\nNew body\n')
  })

  it('throws when multiple matches are found', () => {
    const current = parse('# Duplicate\n\nBody 1\n\n# Duplicate\n\nBody 2\n')
    const replacement = parse('# Duplicate\n\nNew body\n')

    expect(() => replaceHeadingSection(current, replacement)).toThrow(
      'Found multiple headings matching "Duplicate" at depth 1',
    )
  })

  it('throws when replacement content has no heading', () => {
    const current = parse('# Section\n\nBody\n')
    const replacement = parse('Paragraph without heading\n')

    expect(() => replaceHeadingSection(current, replacement)).toThrow(
      'Expected replacement content to contain a heading',
    )
  })
})
