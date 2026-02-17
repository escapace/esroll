import type { ApiItem, ApiModel } from '@microsoft/api-extractor-model'
import {
  DocNodeKind,
  DocNodeTransforms,
  type DocBlockTag,
  type DocCodeSpan,
  type DocErrorText,
  type DocEscapedText,
  type DocFencedCode,
  type DocHtmlEndTag,
  type DocHtmlStartTag,
  type DocLinkTag,
  type DocNode,
  type DocParagraph,
  type DocPlainText,
  type DocSection,
  type DocSoftBreak,
} from '@microsoft/tsdoc'
import type { RootContent } from 'mdast'
import { sanitizeUri } from 'micromark-util-sanitize-uri'
import { createAnchor } from './create-anchor'
import { isTSDocNodeKind } from './is-tsdoc-node-kind'
import { fromMarkdown } from './markdown'
import { referenceText } from './reference-text'
import { sanitizeLinkText } from './sanitize-link-text'
import { trimLines } from './trim-lines'

export interface TSDocMarkdownWriterOptions {
  softBreaks?: boolean
}

export const DEFAULT_TSDOC_MARKDOWN_WRITER_OPTIONS: TSDocMarkdownWriterOptions = {
  softBreaks: true,
}

export interface TSDocMarkdownWriterState {
  content: string
  item: ApiItem
  model: ApiModel
}

export interface FromTSDocNodeOptions
  extends Pick<TSDocMarkdownWriterState, 'item' | 'model'>, TSDocMarkdownWriterOptions {
  node: DocNode
}

export function fromTSDocNode(options: FromTSDocNodeOptions): RootContent[] {
  const { item, model, node, softBreaks = true } = options
  return fromMarkdown(
    new TSDocMarkdownWriter({ item, model }).writeTSDocNode(node, { softBreaks }).content,
  )
}

class TSDocMarkdownWriter {
  private readonly state: TSDocMarkdownWriterState

  constructor(options: Omit<TSDocMarkdownWriterState, 'content'>) {
    this.state = {
      ...options,
      content: '',
    }
  }

  get content() {
    return this.state.content
  }

  writeTSDocNode(
    node: DocNode,
    options: TSDocMarkdownWriterOptions = DEFAULT_TSDOC_MARKDOWN_WRITER_OPTIONS,
  ) {
    if (isTSDocNodeKind<DocPlainText>(node, DocNodeKind.PlainText)) {
      this.write(trimLines(node.text))
    } else if (
      isTSDocNodeKind<DocHtmlStartTag>(node, DocNodeKind.HtmlStartTag) ||
      isTSDocNodeKind<DocHtmlEndTag>(node, DocNodeKind.HtmlEndTag)
    ) {
      // TODO: test this
      this.write(node.emitAsHtml())
    } else if (isTSDocNodeKind<DocCodeSpan>(node, DocNodeKind.CodeSpan)) {
      this.write('`', node.code, '`')
    } else if (isTSDocNodeKind<DocLinkTag>(node, DocNodeKind.LinkTag)) {
      if (node.urlDestination !== undefined) {
        this.write(
          '[',
          sanitizeLinkText(node.linkText ?? node.urlDestination),
          '](',
          sanitizeUri(node.urlDestination),
          ')',
        )
      } else if (node.codeDestination !== undefined) {
        const referenceResult = this.state.model.resolveDeclarationReference(
          node.codeDestination,
          this.state.item,
        )

        if (
          referenceResult.errorMessage === undefined &&
          referenceResult.resolvedApiItem !== undefined
        ) {
          const item = referenceResult.resolvedApiItem

          const text = referenceText(item, true)
          const path = createAnchor(item)

          this.write('[', sanitizeLinkText(node.linkText ?? text), '](', path, ')')
        } else {
          throw new Error(
            referenceResult.errorMessage ??
              `Unable to resolve reference ${node.codeDestination.emitAsTsdoc()}`,
          )
        }
      } else if (node.linkText !== undefined) {
        this.write(node.linkText)
      }
    } else if (isTSDocNodeKind<DocParagraph>(node, DocNodeKind.Paragraph)) {
      this.writeTSDocNodes(DocNodeTransforms.trimSpacesInParagraph(node).nodes, options)
      this.writeIfNeeded('\n\n')
    } else if (isTSDocNodeKind<DocFencedCode>(node, DocNodeKind.FencedCode)) {
      this.writeIfNeeded('\n')
      this.write('```', node.language, '\n', trimLines(node.code), '\n', '```', '\n\n')
    } else if (isTSDocNodeKind<DocSection>(node, DocNodeKind.Section)) {
      this.writeTSDocNodes(node.nodes, options)
    } else if (
      isTSDocNodeKind<DocSoftBreak>(node, DocNodeKind.SoftBreak) &&
      options.softBreaks !== false
    ) {
      // trimSpacesInParagraphNodes() discards the soft breaks
      this.writeIfNeeded('\n')
    } else if (isTSDocNodeKind<DocEscapedText>(node, DocNodeKind.EscapedText)) {
      this.write(node.encodedText)
    } else if (isTSDocNodeKind<DocBlockTag>(node, DocNodeKind.BlockTag)) {
      // skip
    } else if (isTSDocNodeKind<DocErrorText>(node, DocNodeKind.ErrorText)) {
      // skip
    } else {
      throw new TypeError(`Unknown docNode kind: ${node.kind}`)
    }

    return this
  }

  private writeTSDocNodes(
    nodes: readonly DocNode[],
    options: TSDocMarkdownWriterOptions = DEFAULT_TSDOC_MARKDOWN_WRITER_OPTIONS,
  ) {
    for (const node of nodes) {
      this.writeTSDocNode(node, options)
    }

    return this
  }

  private writeIfNeeded(string: string): this {
    if (!this.endsWith(string)) {
      this.write(string)
    }
    return this
  }

  private write(...parts: string[]): this {
    this.state.content += parts.join('')
    return this
  }

  private endsWith(string: string) {
    return this.state.content.endsWith(string)
  }
}
