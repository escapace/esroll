import type { RootContent } from 'mdast'
import { isEmpty } from './is-empty'

/**
 * Removes headings from a markdown AST that introduce sections containing no content.
 *
 * @param children - Array of markdown AST root content nodes to process
 * @returns Filtered array with empty section headings removed
 *
 * @remarks
 * Empty sections occur when a heading is followed immediately by another heading at the same
 * or higher level, or when a heading appears at the end of the document with no content after it.
 * Lower-level headings only count as content if their own sections are non-empty, preventing
 * cascades of meaningless nested headings. The function operates in a single pass and produces
 * the same result when applied multiple times to the same input.
 */
export function removeEmptyHeadings(children: RootContent[]): RootContent[] {
  // We’ll mark headings to keep/drop by index. Non-headings are always kept.
  const keep = Array(children.length).fill(true) as boolean[]

  interface Frame {
    depth: number
    hasContent: boolean
    index: number
  }
  const stack: Frame[] = []

  const closeUntil = (depth: number) => {
    // Close sections with depth >= given depth.
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      const frame = stack.pop()!
      if (!frame.hasContent) {
        // Drop empty heading.
        keep[frame.index] = false
      } else {
        // A non-empty subsection exists -> counts as content for its parent.
        if (stack.length > 0) {
          stack[stack.length - 1].hasContent = true
        }
      }
    }
  }

  const markContentForAllOpen = () => {
    for (const frame of stack) frame.hasContent = true
  }

  for (let index = 0; index < children.length; index++) {
    const node = children[index]

    if (node.type === 'heading') {
      const depth = node.depth

      // Starting a new section closes any section of same or higher rank.
      closeUntil(depth)

      // Open a new (currently empty) section for this heading.
      stack.push({ depth, hasContent: false, index })
      continue
    }

    // Non-heading nodes: if they're substantive, they are content for *all* open sections.
    if (!isEmpty(node)) {
      markContentForAllOpen()
    }
    // If empty, they don't affect section content.
  }

  // End of document: close remaining sections.
  closeUntil(0)

  // Build result, filtering dropped headings.
  const result: RootContent[] = []
  for (let index = 0; index < children.length; index++) {
    const node = children[index]
    if (node.type === 'heading') {
      if (keep[index]) result.push(node)
    } else {
      result.push(node)
    }
  }
  return result
}
