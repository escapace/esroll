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

    let isAParentOfB = false
    let isBParentOfA = false
    let inheritance = 0

    isAParentOfB = metadataB.extendsComplete.has(a)
    isBParentOfA = metadataA.extendsComplete.has(b)

    inheritance = isAParentOfB === isBParentOfA ? 0 : isAParentOfB ? -1 : isBParentOfA ? 1 : 0

    if (inheritance !== 0) {
      return inheritance
    }

    isAParentOfB = metadataB.parents.has(a)
    isBParentOfA = metadataA.parents.has(b)

    inheritance = isAParentOfB === isBParentOfA ? 0 : isAParentOfB ? -1 : isBParentOfA ? 1 : 0

    if (inheritance !== 0) {
      return inheritance
    }

    const depthA = calculatePathDepth(metadataA.filePath)
    const depthB = calculatePathDepth(metadataB.filePath)

    if (depthA !== undefined && depthB !== undefined && depthA !== depthB) {
      return depthA - depthB
    }

    return collator.compare(a.displayName, b.displayName)
  }
}
