import type { List, ListItem, Root, RootContent } from 'mdast'
import { visit } from 'unist-util-visit'

/**
 * Converts all lists in a markdown AST from loose to tight format.
 *
 * @param children - Array of markdown AST root content nodes to process
 * @returns Modified array with all list spread properties set to false
 *
 * @remarks
 * Loose lists have blank lines between items and render list items wrapped in paragraph tags.
 * Tight lists have no blank lines between items and render list items without paragraph wrappers.
 * The spread property controls this behavior on both List and ListItem nodes. Setting spread to
 * false produces more compact output by removing vertical spacing between consecutive list items.
 */
export function makeListsTight(children: RootContent[]): RootContent[] {
  const tree: Root = { children, type: 'root' }

  // Visit all list nodes and set spread to false
  visit(tree, 'list', (node: List) => {
    node.spread = false
  })

  // Visit all listItem nodes and set spread to false
  visit(tree, 'listItem', (node: ListItem) => {
    node.spread = false
  })

  return tree.children
}
