import { ApiItemKind, type ApiItem } from '@microsoft/api-extractor-model'
import { describe, expect, it } from 'vitest'
import { selectPreferredOverloads } from './select-preferred-overloads'

type MutableApiItem = {
  kind: ApiItem['kind']
  overloadIndex?: number
  parent?: ApiItem
  tsdocComment?: object
} & ApiItem

const createApiItem = (options: {
  displayName: string
  kind: ApiItem['kind']
  overloadIndex?: number
  parent?: ApiItem
  tsdocComment?: object
}): ApiItem => {
  const item = {
    ...options,
    getHierarchy: () => [],
    hasOwnPackage: () => false,
  }

  return item as ApiItem
}

describe('selectPreferredOverloads', () => {
  it('keeps non-overloaded items unchanged', () => {
    const parent = createApiItem({ displayName: 'entry', kind: ApiItemKind.EntryPoint })
    const a = createApiItem({ displayName: 'a', kind: ApiItemKind.Function, parent })
    const b = createApiItem({ displayName: 'b', kind: ApiItemKind.Function, parent })

    expect(selectPreferredOverloads([a, b])).toEqual([a, b])
  })

  it('picks the highest overload index per overload group', () => {
    const parent = createApiItem({ displayName: 'entry', kind: ApiItemKind.EntryPoint })
    const overload1 = createApiItem({
      displayName: 'canonicalize',
      kind: ApiItemKind.Function,
      overloadIndex: 1,
      parent,
      tsdocComment: {},
    })
    const overload2 = createApiItem({
      displayName: 'canonicalize',
      kind: ApiItemKind.Function,
      overloadIndex: 2,
      parent,
    })

    const result = selectPreferredOverloads([overload1, overload2])

    expect(result).toHaveLength(1)
    expect(result[0]).toBe(overload2)
  })

  it('copies tsdoc from documented overload to selected overload when needed', () => {
    const parent = createApiItem({ displayName: 'entry', kind: ApiItemKind.EntryPoint })
    const comment = { marker: 'comment' }
    const overload1 = createApiItem({
      displayName: 'canonicalize',
      kind: ApiItemKind.Function,
      overloadIndex: 1,
      parent,
      tsdocComment: comment,
    })
    const overload2 = createApiItem({
      displayName: 'canonicalize',
      kind: ApiItemKind.Function,
      overloadIndex: 2,
      parent,
    })

    const [selected] = selectPreferredOverloads([overload2, overload1]) as MutableApiItem[]

    expect(selected).toBe(overload2)
    expect(selected.tsdocComment).toBe(comment)
  })
})
