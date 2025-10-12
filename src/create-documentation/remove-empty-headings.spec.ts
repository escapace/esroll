import { fromMarkdown } from 'mdast-util-from-markdown'
import type { Root } from 'mdast'
import { describe, expect, it } from 'vitest'
import { removeEmptyHeadings } from './remove-empty-headings'

const parse = (markdown: string): Root => fromMarkdown(markdown)

describe('removeEmptyHeadings', () => {
  describe('removal cases', () => {
    it('removes empty heading at EOF', () => {
      const input = parse('# Empty\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })

    it('removes empty heading before same-level heading', () => {
      const input = parse('# Empty\n\n# Non-empty\n\nContent here.\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })

    it('removes empty heading before higher-level heading', () => {
      const input = parse('## Empty\n\n# Higher Level\n\nContent.\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })

    it('removes multiple consecutive empty headings', () => {
      const input = parse('# Empty 1\n\n## Empty 2\n\n### Empty 3\n\n# Content\n\nText.\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })

    it('removes empty parent when all nested headings are empty', () => {
      const input = parse('# Empty Parent\n\n## Empty Child\n\n### Empty Grandchild\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })
  })

  describe('preservation cases', () => {
    it('keeps heading with paragraph content', () => {
      const input = parse('# Title\n\nSome content.\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })

    it('keeps heading with code block', () => {
      const input = parse('# Code Section\n\n```js\nconst x = 1\n```\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })

    it('keeps heading with non-empty list', () => {
      const input = parse('# List Section\n\n- Item 1\n- Item 2\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })

    it('keeps heading when child heading has content', () => {
      const input = parse('# Parent\n\n## Child\n\nChild content.\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })

    it('keeps heading with blockquote containing content', () => {
      const input = parse('# Quote Section\n\n> Quote text.\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })
  })

  describe('whitespace handling', () => {
    it('removes heading with only thematic break', () => {
      const input = parse('# Section\n\n---\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })
    it('removes heading with whitespace-only paragraph', () => {
      const input = parse('# Whitespace\n\n   \n\t\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })

    it('removes heading with empty list', () => {
      const input = parse('# List\n\n- \n-   \n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })

    it('removes heading with empty blockquote', () => {
      const input = parse('# Quote\n\n>   \n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })

    it('removes heading with whitespace-only code block', () => {
      const input = parse('# Code\n\n```\n   \n\t\n```\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })

    it('keeps heading with NBSP in paragraph', () => {
      const input = parse('# NBSP\n\n\u00A0\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })
  })

  describe('edge cases', () => {
    it('handles empty input', () => {
      expect(removeEmptyHeadings([])).toMatchSnapshot()
    })

    it('handles input with no headings', () => {
      const input = parse('Just text.\n\nMore text.\n')
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })

    it('is idempotent', () => {
      const input = parse('# Empty\n\n# Content\n\nText.\n\n## Empty child\n')
      const once = removeEmptyHeadings(input.children)
      const twice = removeEmptyHeadings(once)
      expect(once).toEqual(twice)
    })

    it('handles complex nested structure', () => {
      const input = parse(`# Level 1 - Empty

## Level 2 - Empty

### Level 3 - Has Content

Content here.

## Level 2 - Also Has Content (via child)

### Level 3 - Child Content

Child text.

# Another Level 1 - Empty

## Nested Empty
`)
      expect(removeEmptyHeadings(input.children)).toMatchSnapshot()
    })
  })

  describe('contract verification', () => {
    it('removes empty headings but preserves non-empty ones', () => {
      const input = parse('# Empty 1\n\n# Non-Empty\n\nContent.\n\n## Empty 2\n')
      const result = removeEmptyHeadings(input.children)

      const headings = result.filter((node) => node.type === 'heading')
      expect(headings).toHaveLength(1)
      expect(headings[0]).toMatchObject({
        children: [{ type: 'text', value: 'Non-Empty' }],
        depth: 1,
        type: 'heading',
      })
    })

    it('preserves all non-heading content', () => {
      const input = parse(
        '# Empty\n\nParagraph 1\n\n# Non-Empty\n\nParagraph 2\n\n## Empty child\n',
      )
      const result = removeEmptyHeadings(input.children)

      const paragraphs = result.filter((node) => node.type === 'paragraph')
      expect(paragraphs).toHaveLength(2)
      expect(paragraphs[0].children[0]).toMatchObject({ type: 'text', value: 'Paragraph 1' })
      expect(paragraphs[1].children[0]).toMatchObject({ type: 'text', value: 'Paragraph 2' })
    })

    it('correctly propagates content upward from nested headings', () => {
      const input = parse('# Parent\n\n## Child\n\n### Grandchild\n\nText.\n')
      const result = removeEmptyHeadings(input.children)

      const headings = result.filter((node) => node.type === 'heading')
      expect(headings).toHaveLength(3)

      const parentHeading = headings.find((h) => h.depth === 1)
      const childHeading = headings.find((h) => h.depth === 2)
      const grandchildHeading = headings.find((h) => h.depth === 3)

      expect(parentHeading).toBeDefined()
      expect(childHeading).toBeDefined()
      expect(grandchildHeading).toBeDefined()
    })
  })
})
