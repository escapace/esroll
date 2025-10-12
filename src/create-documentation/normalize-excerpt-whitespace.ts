import type { Link, Parent, Text } from 'mdast'
import { visit } from 'unist-util-visit'

/**
 * Normalizes whitespace in excerpt content containing text and link nodes
 * through seven sequential transformation passes.
 *
 * @param content - Array of Link and Text nodes to process in place
 * @returns The mutated content array with normalized whitespace
 *
 * @remarks
 * Processing occurs in seven passes:
 *
 * 1. Merges text nodes within links and replaces their internal newlines with
 *    spaces, collapsing multi-line link text into single-line format.
 *
 * 2. Splits remaining text nodes at newline boundaries, creating separate nodes
 *    where each (except the last segment) terminates with a line ending.
 *
 * 3. Collapses consecutive spaces and manages spacing at node boundaries by
 *    tracking whether the previous node ended with a space or newline,
 *    preserving indentation after line breaks while preventing double-spacing
 *    between nodes.
 *
 * 4. Removes text nodes containing only whitespace and newlines, cleaning up
 *    empty remnants from previous transformations.
 *
 * 5. Collects all text nodes in document order and identifies which nodes begin
 *    lines by examining line endings and building an array of first-on-line nodes.
 *
 * 6. Removes all leading spaces from the first and last lines and all trailing
 *    spaces from the final node.
 *
 * 7. Measures indentation across middle lines (when three or more lines exist),
 *    identifies the minimum common indentation, and removes `max(0, minIndent - 2)`
 *    spaces from each middle line to establish a two-space baseline while
 *    preserving relative indentation; if any middle line starts at column zero,
 *    no indentation is removed.
 *
 * Space normalization respects node boundaries to prevent accumulation of
 * spaces across adjacent nodes. First and last lines are fully trimmed of
 * leading and trailing spaces respectively. Middle lines maintain their relative
 * indentation structure with a minimum two-space baseline when common
 * indentation exists.
 */
export function normalizeExcerptWhitespace(content: Array<Link | Text>): Array<Link | Text> {
  const root: Parent = { children: content, type: 'paragraph' }

  // First pass: collapse text nodes within links
  visit(root, 'link', (link: Link) => {
    const textNodes = link.children.filter((child) => child.type === 'text')
    if (textNodes.length > 0) {
      const combined = textNodes.map((node) => node.value).join('')
      const normalized = combined.replace(/\r?\n/g, ' ')
      link.children = [{ type: 'text', value: normalized }]
    }
  })

  // Second pass: split text nodes by newlines
  visit(root, 'text', (node, index, parent) => {
    if (parent !== undefined && index !== undefined) {
      const segments = node.value.split(/\r?\n/)
      if (segments.length > 1) {
        const newNodes: Text[] = []
        for (let index_ = 0; index_ < segments.length; index_++) {
          const segment = segments[index_]
          const isLast = index_ === segments.length - 1
          if (segment.length > 0 || !isLast) {
            newNodes.push({
              type: 'text',
              value: isLast ? segment : segment + '\n',
            })
          }
        }
        parent.children.splice(index, 1, ...newNodes)
        return index + newNodes.length
      }
    }
    return undefined
  })

  // Third pass: process text nodes in document order
  let previousEndedWithSpace = false
  let previousEndedWithNewline = false

  visit(root, 'text', (node: Text) => {
    let v = node.value

    if (previousEndedWithNewline) {
      // At start of line - preserve leading spaces (indentation)
      const leadingSpaces = /^ */.exec(v)?.[0] ?? ''
      const rest = v.slice(leadingSpaces.length)
      v = leadingSpaces + rest.replace(/ {2,}/g, ' ')
    } else {
      // Within a line
      if (previousEndedWithSpace) {
        v = v.replace(/^ +/, '') // drop leading spaces to prevent space-space
      }
      v = v.replace(/ {2,}/g, ' ') // collapse internal runs
    }

    // Remove trailing spaces before newlines
    v = v.replace(/ +(\r?\n)/g, '$1')

    // Update boundary state
    if (/\r?\n$/.test(v)) {
      previousEndedWithSpace = false
      previousEndedWithNewline = true
    } else {
      previousEndedWithSpace = v.endsWith(' ')
      previousEndedWithNewline = false
    }

    node.value = v
  })

  // Fourth pass: remove whitespace-only text nodes
  visit(root, 'text', (node, index, parent) => {
    if (parent !== undefined && index !== undefined && /^\s*$/.test(node.value)) {
      parent.children.splice(index, 1)
      return index
    }
    return undefined
  })

  // Fifth pass: collect all text nodes and identify line boundaries
  const allTextNodes: Text[] = []
  visit(root, 'text', (node: Text) => {
    allTextNodes.push(node)
  })

  // Sixth pass: build array of nodes that are first on their line
  const firstNodeOnLine: Text[] = []
  if (allTextNodes.length > 0) {
    firstNodeOnLine.push(allTextNodes[0]) // First node is always first-on-line
    for (let index = 0; index < allTextNodes.length - 1; index++) {
      if (/\r?\n$/.test(allTextNodes[index].value)) {
        firstNodeOnLine.push(allTextNodes[index + 1])
      }
    }
  }

  // Seventh pass: strip leading spaces from first line
  const firstNode = firstNodeOnLine.at(0)
  if (firstNode !== undefined) {
    firstNode.value = firstNode.value.replace(/^ +/, '')
  }

  // Strip leading spaces from first node of last line
  const lastLineFirstNode = firstNodeOnLine.at(-1)
  if (lastLineFirstNode !== undefined) {
    lastLineFirstNode.value = lastLineFirstNode.value.replace(/^ +/, '')
  }

  // Strip trailing spaces from last text node overall
  const lastTextNode = allTextNodes.at(-1)
  if (lastTextNode !== undefined) {
    lastTextNode.value = lastTextNode.value.replace(/ +$/, '')
  }

  // (Seventh pass continued) Handle middle lines: remove common minimum indentation
  if (firstNodeOnLine.length >= 3) {
    const middleNodes = firstNodeOnLine.slice(1, firstNodeOnLine.length - 1)

    // Detect minimum indentation across all middle nodes
    const indentations = middleNodes.map((node) => /^ */.exec(node.value)?.[0].length ?? 0)

    if (indentations.length > 0) {
      const minIndent = Math.min(...indentations)

      // If there was common indentation, leave 2 spaces minimum
      if (minIndent > 0) {
        // Calculate spaces to remove: minIndent - 2, but never negative
        // Examples: minIndent=1 → remove 0 (leave 1), minIndent=8 → remove 6 (leave 2)
        const spacesToRemove = Math.max(0, minIndent - 2)

        if (spacesToRemove > 0) {
          for (const node of middleNodes) {
            node.value = node.value.replace(new RegExp(`^ {${spacesToRemove}}`), '')
          }
        }
      }
    }
  }

  return root.children as Array<Link | Text>
}
