import type { ApiItem } from '@microsoft/api-extractor-model'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const calculatePathDepth = (value?: string) => {
  if (value === undefined) {
    return 0
  }

  return pathToFileURL(path.resolve('/', value)).pathname.split('/').filter(Boolean).length
}

export const createApiComparator = () => {
  const collator = new Intl.Collator('en')

  return (a: ApiItem, b: ApiItem): number => {
    const metadataA = a.metadata
    const metadataB = b.metadata

    const aExtendsB = metadataB.extendsComplete.has(a)
    const bExtendsA = metadataA.extendsComplete.has(b)
    const extendsRelation = aExtendsB === bExtendsA ? 0 : aExtendsB ? -1 : bExtendsA ? 1 : 0

    if (extendsRelation !== 0) {
      return extendsRelation
    }

    const aIsParentOfB = metadataB.parents.has(a)
    const bIsParentOfA = metadataA.parents.has(b)
    const parentRelation =
      aIsParentOfB === bIsParentOfA ? 0 : aIsParentOfB ? -1 : bIsParentOfA ? 1 : 0

    if (parentRelation !== 0) {
      return parentRelation
    }

    const depthA = calculatePathDepth(metadataA.filePath)
    const depthB = calculatePathDepth(metadataB.filePath)

    if (depthA !== undefined && depthB !== undefined && depthA !== depthB) {
      return depthA - depthB
    }

    return collator.compare(a.displayName, b.displayName)
  }
}
