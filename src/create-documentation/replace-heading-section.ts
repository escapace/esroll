import type { Heading, Root, RootContent } from 'mdast'
import { toString } from 'mdast-util-to-string'

function findFirstHeading(children: RootContent[]): Heading | undefined {
  for (const node of children) {
    if (node.type === 'heading') return node
  }
  return undefined
}

export function replaceHeadingSection(tree: Root, newContent: Root): Root {
  const heading = findFirstHeading(newContent.children)
  if (heading === undefined) {
    throw new Error('Expected replacement content to contain a heading')
  }

  const needleDepth = heading.depth
  const needleText = toString(heading).trim()

  const matches: number[] = []
  for (let index = 0; index < tree.children.length; index++) {
    const child = tree.children[index]
    if (child.type !== 'heading') continue
    if (child.depth !== needleDepth) continue
    if (toString(child).trim() !== needleText) continue
    matches.push(index)
  }

  if (matches.length > 1) {
    throw new Error(`Found multiple headings matching "${needleText}" at depth ${needleDepth}`)
  }

  if (matches.length === 0) {
    tree.children.push(...newContent.children)
    return tree
  }

  const start = matches[0]
  let end = tree.children.length

  for (let index = start + 1; index < tree.children.length; index++) {
    const child = tree.children[index]
    if (child.type !== 'heading') continue
    if (child.depth <= needleDepth) {
      end = index
      break
    }
  }

  tree.children.splice(start, end - start, ...newContent.children)

  return tree
}
