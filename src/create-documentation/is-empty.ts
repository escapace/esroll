import type {
  BlockContent,
  DefinitionContent,
  ListItem,
  Parent,
  PhrasingContent,
  Root,
  RootContent,
  TableCell,
  TableRow,
} from 'mdast'

type EmptyCheckNode =
  | BlockContent
  | DefinitionContent
  | ListItem
  | PhrasingContent
  | Root
  | RootContent
  | TableCell
  | TableRow

/**
 * Determines whether a node contains no meaningful content.
 *
 * @param node - Node to check
 * @returns True if the node is empty
 *
 * @remarks
 * Nodes containing only empty children (blockquote, delete, emphasis, heading, link, linkReference,
 * list, listItem, paragraph, strong, table, tableCell, tableRow) are empty when all their children
 * are empty or when they have no children.
 *
 * Nodes that are always empty: break, thematicBreak
 *
 * Nodes that are empty when containing only whitespace: code, inlineCode, html, text
 *
 * All other node types (such as image) return false.
 */
export function isEmpty(node: EmptyCheckNode): boolean {
  switch (node.type) {
    case 'blockquote':
    case 'delete':
    case 'emphasis':
    case 'heading':
    case 'link':
    case 'linkReference':
    case 'list':
    case 'listItem':
    case 'paragraph':
    case 'root':
    case 'strong':
    case 'table':
    case 'tableCell':
    case 'tableRow':
      return hasOnlyEmptyChildren(node)
    case 'break':
    case 'thematicBreak':
      return true
    case 'code':
    case 'inlineCode':
      return trimToSpace(node.value) === ''
    case 'html':
      return trimToSpace(node.value?.replace(/<br\s*\/?>/gi, '') ?? '') === ''
    case 'text':
      return trimToSpace(node.value) === ''
    default:
      return false
  }
}

/**
 * Checks if a parent node has only empty children.
 *
 * @param parent - Parent node to check
 * @returns True if all children are empty
 */
function hasOnlyEmptyChildren(parent: Parent): boolean {
  if (parent.children.length === 0) return true
  return !parent.children.some((value) => !isEmpty(value))
}

/**
 * Trims and collapses whitespace in text.
 *
 * @param text - Text to process
 * @returns Text with collapsed and trimmed whitespace
 *
 * @remarks
 * Collapses consecutive ASCII whitespace characters into single spaces and trims leading/trailing
 * whitespace. Non-breaking spaces (U+00A0) are preserved and count as content.
 */
function trimToSpace(text: string): string {
  return text.replace(/[ \t\r\n]+/g, ' ').replace(/^ +| +$/g, '')
}
