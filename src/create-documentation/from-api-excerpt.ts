import type { ApiItem, ApiModel, Excerpt } from '@microsoft/api-extractor-model'
import type { Link, PhrasingContent, Text } from 'mdast'
import { createAnchor } from './create-anchor'
import { normalizeExcerptWhitespace } from './normalize-excerpt-whitespace'
import { referenceText } from './reference-text'

export function fromApiExcerpt(options: {
  item: ApiItem
  model: ApiModel
  excerpt?: Excerpt
}): PhrasingContent[] {
  if (options.excerpt === undefined) {
    return []
  }

  const tokens = options.excerpt.tokens.slice(
    options.excerpt.tokenRange.startIndex,
    options.excerpt.tokenRange.endIndex,
  )

  if (options.excerpt.tokens.length === 0) {
    return []
  }

  const content: Array<Link | Text> = []

  for (const token of tokens) {
    const text = token.text

    if (token.canonicalReference !== undefined) {
      const reference = options.model.resolveDeclarationReference(
        token.canonicalReference,
        options.item,
      )

      if (reference.errorMessage === undefined && reference.resolvedApiItem !== undefined) {
        const title = referenceText(reference.resolvedApiItem)
        const url = createAnchor(reference.resolvedApiItem)

        content.push({
          children: [{ type: 'text', value: text }],
          title,
          type: 'link',
          url,
        })

        continue
      }
    }

    content.push({ type: 'text', value: text })
  }

  return [
    { type: 'html', value: '<pre>' },
    ...normalizeExcerptWhitespace(content),
    { type: 'html', value: '</pre>' },
  ]
}
