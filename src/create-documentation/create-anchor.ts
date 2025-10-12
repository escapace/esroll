import type { ApiItem } from '@microsoft/api-extractor-model'
import { slug as createSlug } from 'github-slugger'
import { toString } from 'mdast-util-to-string'
import { sanitizeUri } from 'micromark-util-sanitize-uri'
import { createHeadingChildren } from './create-heading-children'

export const createAnchor = (item: ApiItem) =>
  sanitizeUri(`#${createSlug(toString(createHeadingChildren(item)))}`)
