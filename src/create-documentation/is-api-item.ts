import type { ApiItem, ApiItemKind } from '@microsoft/api-extractor-model'

export function isApiItem<T extends ApiItem>(
  node: { kind: T['kind'] },
  kind: ApiItemKind,
): node is T {
  return node.kind.valueOf() === kind.valueOf()
}
