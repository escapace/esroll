import type { ApiItem } from '@microsoft/api-extractor-model'
import type { PhrasingContent } from 'mdast'
import { referenceText } from './reference-text'

export const createHeadingChildren = (item: ApiItem): PhrasingContent[] => {
  const url = item.metadata.url
  const text = referenceText(item)

  return url === undefined
    ? [{ type: 'text', value: text }]
    : [
        { type: 'text', value: text },
        { type: 'text', value: ' ' },
        {
          children: [{ type: 'text', value: '↗' }],
          title: referenceText(item, true),
          type: 'link',
          url,
        },
      ]
}
