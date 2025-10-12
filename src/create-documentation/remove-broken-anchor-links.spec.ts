import { fromMarkdown } from 'mdast-util-from-markdown'
import type { Root } from 'mdast'
import { describe, expect, it } from 'vitest'
import { removeBrokenAnchorLinks } from './remove-broken-anchor-links'

const parse = (markdown: string): Root => fromMarkdown(markdown)

describe('removeBrokenAnchorLinks', () => {
  describe('valid anchor links', () => {
    it('keeps link to existing heading', () => {
      const input = parse('# Introduction\n\nSee [intro](#introduction) for details.\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('keeps link to heading with special characters', () => {
      const input = parse('# Hello World!\n\nRead [hello](#hello-world) section.\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('keeps link to heading with numbers', () => {
      const input = parse('# Section 123\n\nGo to [section](#section-123).\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('keeps multiple valid anchor links', () => {
      const input = parse(`# First\n\n# Second\n\nLinks: [one](#first) and [two](#second).\n`)
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('keeps link with nested formatting to valid anchor', () => {
      const input = parse('# Target\n\nSee [**bold** text](#target).\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })
  })

  describe('broken anchor links', () => {
    it('replaces link to non-existent heading with children', () => {
      const input = parse('# Real Heading\n\nSee [fake link](#non-existent).\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('replaces multiple broken anchor links', () => {
      const input = parse('Links: [one](#broken-1) and [two](#broken-2).\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('replaces link with nested formatting', () => {
      const input = parse('See [**important** info](#missing).\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('replaces link with code in children', () => {
      const input = parse('Check [`code` reference](#absent).\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('handles empty anchor link', () => {
      const input = parse('Go to [top](#).\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })
  })

  describe('non-anchor links', () => {
    it('keeps external http links', () => {
      const input = parse('Visit [example](https://example.com).\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('keeps external https links', () => {
      const input = parse('See [docs](https://docs.example.com/guide).\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('keeps relative path links', () => {
      const input = parse('Read [file](./other.md).\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('keeps absolute path links', () => {
      const input = parse('Open [page](/docs/guide.md).\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })
  })

  describe('mixed scenarios', () => {
    it('handles mix of valid and broken anchors', () => {
      const input = parse(`# Real Section\n\nLinks: [valid](#real-section) and [broken](#fake).\n`)
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('handles links in different block types', () => {
      const input = parse(
        `# Heading\n\nParagraph [link](#heading).\n\n> Quote [broken](#missing).\n`,
      )
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('handles nested links in lists', () => {
      const input = parse(`# Topic\n\n- Item with [valid](#topic)\n- Item with [broken](#absent)\n`)
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('preserves text when link has only text children', () => {
      const input = parse('Click [here](#nowhere).\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })
  })

  describe('edge cases', () => {
    it('handles empty input', () => {
      expect(removeBrokenAnchorLinks([])).toMatchSnapshot()
    })

    it('handles document with no headings', () => {
      const input = parse('Text with [link](#anchor).\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('handles document with no links', () => {
      const input = parse('# Heading\n\nJust text.\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('handles heading with complex text', () => {
      const input = parse('# `Code` **Bold** _Italic_\n\nLink to [section](#code-bold-italic).\n')
      expect(removeBrokenAnchorLinks(input.children)).toMatchSnapshot()
    })

    it('is idempotent', () => {
      const input = parse('# Real\n\nLinks: [valid](#real) and [broken](#fake).\n')
      const once = removeBrokenAnchorLinks(input.children)
      const twice = removeBrokenAnchorLinks(once)
      expect(once).toEqual(twice)
    })
  })

  describe('contract verification', () => {
    it('preserves valid anchor links as link nodes', () => {
      const input = parse(
        '# Introduction\n\n# Guide\n\nSee [intro](#introduction) and [guide](#guide).\n',
      )
      const result = removeBrokenAnchorLinks(input.children)

      const paragraph = result.find((node) => node.type === 'paragraph')
      const links = paragraph?.children.filter((child) => child.type === 'link')

      expect(links).toHaveLength(2)
      expect(links?.[0]).toMatchObject({ type: 'link', url: '#introduction' })
      expect(links?.[1]).toMatchObject({ type: 'link', url: '#guide' })
    })

    it('replaces broken anchor links with their text content', () => {
      const input = parse('# Real\n\nSee [broken link](#fake) here.\n')
      const result = removeBrokenAnchorLinks(input.children)

      const paragraph = result.find((node) => node.type === 'paragraph')
      const links = paragraph?.children.filter((child) => child.type === 'link')
      const textNodes = paragraph?.children.filter((child) => child.type === 'text')

      expect(links).toHaveLength(0)
      expect(textNodes?.some((node) => node.value === 'broken link')).toBe(true)
    })

    it('leaves non-anchor links unchanged', () => {
      const input = parse('Visit [external](https://example.com) and [local](./file.md).\n')
      const result = removeBrokenAnchorLinks(input.children)

      const paragraph = result.find((node) => node.type === 'paragraph')
      const links = paragraph?.children.filter((child) => child.type === 'link')

      expect(links).toHaveLength(2)
      expect(links?.[0]).toMatchObject({ type: 'link', url: 'https://example.com' })
      expect(links?.[1]).toMatchObject({ type: 'link', url: './file.md' })
    })
  })
})
