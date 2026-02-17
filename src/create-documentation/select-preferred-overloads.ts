import { ApiItemKind, type ApiItem } from '@microsoft/api-extractor-model'

interface OverloadGroup {
  documented: ApiItem | undefined
  selected: ApiItem
  selectedOverloadIndex: number
}

type PositionedItem = { item: ApiItem; type: 'item' } | { key: string; type: 'overload-group' }

const getOverloadIndex = (item: ApiItem): number | undefined => {
  const overloadIndex = (item as { overloadIndex?: unknown }).overloadIndex
  return typeof overloadIndex === 'number' ? overloadIndex : undefined
}

const hasTSDocument = (item: ApiItem): boolean => {
  if (!('tsdocComment' in item)) {
    return false
  }

  return (item as { tsdocComment?: unknown }).tsdocComment !== undefined
}

const createOverloadGroupKey = (item: ApiItem): string => {
  const parent = item.parent
  return `${item.kind}:${parent?.kind ?? ''}:${parent?.displayName ?? ''}:${item.displayName}`
}

export const selectPreferredOverloads = (items: readonly ApiItem[]): ApiItem[] => {
  const groups = new Map<string, OverloadGroup>()
  const positionedItems: PositionedItem[] = []

  for (const item of items) {
    const overloadIndex = getOverloadIndex(item)

    if (item.kind !== ApiItemKind.Function || overloadIndex === undefined) {
      positionedItems.push({ item, type: 'item' })
      continue
    }

    const key = createOverloadGroupKey(item)
    const current = groups.get(key)

    if (current === undefined) {
      groups.set(key, {
        documented: hasTSDocument(item) ? item : undefined,
        selected: item,
        selectedOverloadIndex: overloadIndex,
      })

      positionedItems.push({ key, type: 'overload-group' })
      continue
    }

    if (overloadIndex > current.selectedOverloadIndex) {
      current.selected = item
      current.selectedOverloadIndex = overloadIndex
    }

    if (current.documented === undefined && hasTSDocument(item)) {
      current.documented = item
    }
  }

  return positionedItems.map((positionedItem) => {
    if (positionedItem.type === 'item') {
      return positionedItem.item
    }

    const group = groups.get(positionedItem.key)

    if (group === undefined) {
      throw new Error(`Missing overload group: ${positionedItem.key}`)
    }

    const selected = group.selected

    if (!hasTSDocument(selected) && group.documented !== undefined) {
      Object.defineProperty(selected, 'tsdocComment', {
        configurable: true,
        value: (group.documented as { tsdocComment?: unknown }).tsdocComment,
      })
    }

    return selected
  })
}
