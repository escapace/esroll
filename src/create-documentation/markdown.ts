import type { RootContent } from 'mdast'
import { squeezeParagraphs } from 'mdast-squeeze-paragraphs'
import { fromMarkdown as _fromMarkdown } from 'mdast-util-from-markdown'
import {
  gfmStrikethroughFromMarkdown,
  gfmStrikethroughToMarkdown,
} from 'mdast-util-gfm-strikethrough'
import { gfmTableFromMarkdown, gfmTableToMarkdown } from 'mdast-util-gfm-table'
import { toMarkdown as _toMarkdown } from 'mdast-util-to-markdown'
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough'
import { gfmTable } from 'micromark-extension-gfm-table'
import { combineExtensions } from 'micromark-util-combine-extensions'
import { trimLines } from './trim-lines'
import { gfmAutolinkLiteral } from 'micromark-extension-gfm-autolink-literal'
import {
  gfmAutolinkLiteralFromMarkdown,
  gfmAutolinkLiteralToMarkdown,
} from 'mdast-util-gfm-autolink-literal'

export const toMarkdown = (...children: RootContent[]) =>
  _toMarkdown(
    { children, type: 'root' },
    {
      extensions: [
        gfmAutolinkLiteralToMarkdown(),
        gfmStrikethroughToMarkdown(),
        gfmTableToMarkdown({ tableCellPadding: true, tablePipeAlign: false }),
      ],
    },
  )

export const fromMarkdown = (markdown?: string): RootContent[] => {
  if (markdown === undefined) {
    return []
  }

  const tree = _fromMarkdown(trimLines(markdown), {
    extensions: [
      combineExtensions([
        gfmAutolinkLiteral(),
        gfmStrikethrough({ singleTilde: false }),
        gfmTable(),
      ]),
    ],
    mdastExtensions: [
      gfmAutolinkLiteralFromMarkdown(),
      gfmStrikethroughFromMarkdown(),
      gfmTableFromMarkdown(),
    ],
  })

  squeezeParagraphs(tree)

  return tree.children
}
