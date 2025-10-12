import type { DocNodeKind, DocNode } from '@microsoft/tsdoc'

/** Helper function to check node kind and cast to specific type */
export function isTSDocNodeKind<T extends DocNode>(
  node: { kind: T['kind'] },
  kind: DocNodeKind,
): node is T {
  return node.kind.valueOf() === kind.valueOf()
}
