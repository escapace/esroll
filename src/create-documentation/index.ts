import type {
  ApiClass,
  ApiDeclaredItem,
  ApiInterface,
  ApiItem,
  ApiItemMetadata,
  ExcerptToken,
} from '@microsoft/api-extractor-model'
import { ApiItemKind, ApiModel, ExcerptTokenKind } from '@microsoft/api-extractor-model'
import type { Root } from 'mdast'
import { sanitizeUri } from 'micromark-util-sanitize-uri'
import assert from 'node:assert'
import type { FindSourceLocation } from '../create-declarations/create-language-service.ts'
import { ApiMarkdownWriter } from './api-markdown-writer'
import { DOCUMENTATION_TOP_LEVEL_ITEMS } from './constants'
import { createApiComparator } from './create-api-comparator'
import { isApiItem } from './is-api-item'
import { selectPreferredOverloads } from './select-preferred-overloads'

export function createDocumentation(options: {
  /**
   * The output path for the doc model file. The file extension should be ".api.json".
   */
  modelFilePath: string
  findSourceLocation?: FindSourceLocation
  headingDepth?: number
}): Root {
  let headingDepth = options.headingDepth ?? 2
  assert(headingDepth >= 2)
  headingDepth -= 1

  const model = new ApiModel()
  const entry = model.loadPackage(options.modelFilePath)
  const items = collectItems(entry, model, options.findSourceLocation)
  const writer = new ApiMarkdownWriter({ headingDepth, item: entry, model })
  const compare = createApiComparator()
  const apiItems = Array.from(items)

  for (const kind of DOCUMENTATION_TOP_LEVEL_ITEMS) {
    const group = apiItems.filter((item) => item.kind === kind).toSorted(compare)
    if (group.length === 0) {
      continue
    }

    for (const item of selectPreferredOverloads(group)) {
      writer.writeApiItem(item)
    }
  }

  return writer.content ?? { children: [], type: 'root' }
}

function collectItems(
  entryPoint: ApiItem,
  model: ApiModel,
  findSourceLocation?: FindSourceLocation,
): Set<ApiItem> {
  const items = new Set<ApiItem>()
  const queue: ApiItem[] = [entryPoint]

  const createMetadata = (item: ApiItem): ApiItemMetadata => {
    const filePath = (item as ApiDeclaredItem | undefined)?.fileUrlPath

    return {
      extends: new Set(),
      extendsComplete: new Set(),
      filePath,
      parents: new Set(item.getHierarchy()),
      get url() {
        if (
          findSourceLocation === undefined ||
          filePath === undefined ||
          typeof item.displayName !== 'string'
        ) {
          return
        }

        const strategy = [ApiItemKind.Interface, ApiItemKind.TypeAlias].includes(item.kind)
          ? 'type'
          : 'implementation'

        const location = findSourceLocation(item.displayName, filePath, strategy)

        if (location === undefined) {
          return
        }

        return sanitizeUri(
          location.line === location.lineEnd
            ? `${filePath}#L${location.line}`
            : `${filePath}#L${location.line}-L${location.lineEnd}`,
        )
      },
    }
  }

  const extractHeritageTypes = (item: ApiItem) => {
    if (isApiItem<ApiClass>(item, ApiItemKind.Class) && item.extendsType !== undefined) {
      return [item.extendsType]
    }

    if (isApiItem<ApiInterface>(item, ApiItemKind.Interface)) {
      return item.extendsTypes
    }

    return []
  }

  const resolveReference = (
    source: ApiItem,
    token: ExcerptToken | undefined,
  ): ApiItem | undefined => {
    if (token?.kind !== ExcerptTokenKind.Reference || token.canonicalReference === undefined) {
      return undefined
    }

    const result = model.resolveDeclarationReference(token.canonicalReference, source)

    if (
      result?.resolvedApiItem === undefined ||
      result.errorMessage !== undefined ||
      result.resolvedApiItem === source
    ) {
      return undefined
    }

    return result.resolvedApiItem
  }

  while (queue.length > 0) {
    const current = queue.pop()!

    if (items.has(current)) {
      continue
    }

    items.add(current)
    Reflect.set(current, 'metadata', createMetadata(current))

    if (current.members !== undefined) {
      for (const member of current.members) {
        queue.push(member)
      }
    }

    for (const heritage of extractHeritageTypes(current)) {
      const tokens = heritage.excerpt.spannedTokens
      if (tokens.length === 0) {
        continue
      }

      const reference = resolveReference(current, tokens[0])
      if (reference !== undefined) {
        current.metadata.extends.add(reference)
        queue.push(reference)
      }
    }
  }

  const completeInheritance = (item: ApiItem, visited: Set<ApiItem>) => {
    if (visited.has(item)) {
      return
    }

    visited.add(item)
    item.metadata.extends.forEach((parent) => completeInheritance(parent, visited))
  }

  for (const item of items) {
    completeInheritance(item, item.metadata.extendsComplete)
    item.metadata.extendsComplete.delete(item)
  }

  return items
}
