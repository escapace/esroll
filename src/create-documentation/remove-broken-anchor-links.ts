import { slug as createSlug } from 'github-slugger'
import type { Link, Root, RootContent } from 'mdast'
import { toString } from 'mdast-util-to-string'
import { visit, SKIP } from 'unist-util-visit'

/**
 * Replaces anchor links pointing to non-existent headings with their text content.
 *
 * @param children - Array of markdown AST root content nodes to process
 * @returns Modified array with broken anchor links replaced by their children
 *
 * @remarks
 * Anchor links reference headings via their slugified IDs (e.g., `#heading-text`). When a link
 * points to an anchor that does not correspond to any heading in the document, the link provides
 * no navigation value and should be replaced with its plain text content. This prevents broken
 * internal references in generated documentation while preserving the link's text for readability.
 */
export function removeBrokenAnchorLinks(children: RootContent[]): RootContent[] {
  const tree: Root = { children, type: 'root' }
  const validAnchors = new Set<string>()

  // First pass: collect all valid heading anchors
  visit(tree, 'heading', (heading) => {
    const text = toString(heading)
    const anchor = createSlug(text)
    validAnchors.add(anchor)
  })

  // Second pass: replace broken anchor links with their children
  visit(tree, 'link', (link: Link, index, parent) => {
    if (typeof index !== 'number' || parent === undefined) return

    // Only process anchor links (starting with #)
    if (!link.url.startsWith('#')) return

    const anchor = link.url.slice(1)

    // If anchor is valid, keep the link
    if (validAnchors.has(anchor)) return

    // Replace broken anchor link with its children
    parent.children.splice(index, 1, ...link.children)

    // Return index to continue from the first inserted child
    // Skip prevents visiting the newly inserted children
    return [SKIP, index]
  })

  return tree.children
}
