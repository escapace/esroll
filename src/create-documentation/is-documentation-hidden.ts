import type { ApiItem } from '@microsoft/api-extractor-model'
import type { DocComment } from '@microsoft/tsdoc'
import { DOCUMENTATION_HIDDEN_TAG_NAME } from './constants'

/**
 * Determines whether generated Markdown omits an API item.
 *
 * @remarks
 *
 * Hidden items remain in the API model so declaration output and reference resolution are
 * unaffected.
 *
 * @param item - API item to inspect.
 */
export function isDocumentationHidden(item: ApiItem): boolean {
  const comment = (item as { tsdocComment?: DocComment }).tsdocComment
  return comment?.modifierTagSet.hasTagName(DOCUMENTATION_HIDDEN_TAG_NAME) === true
}
