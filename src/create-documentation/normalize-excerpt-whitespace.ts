import type { Link, Text } from 'mdast'
import { linkTextExcerptAdapter } from './adapters/link-text-excerpt-adapter'
import { formatWithStringFormatter } from './format-with-string-formatter'
import { formatTypeScriptTypePresentation } from './typescript-type-presentation-formatter'

export function normalizeExcerptWhitespace(content: Array<Link | Text>): Array<Link | Text> {
  return formatWithStringFormatter({
    adapter: linkTextExcerptAdapter,
    format: formatTypeScriptTypePresentation,
    source: content,
  })
}
