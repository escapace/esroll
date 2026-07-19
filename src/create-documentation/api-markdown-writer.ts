import {
  ApiItemKind,
  type ApiClass,
  type ApiConstructor,
  type ApiDeclaredItem,
  type ApiEnumMember,
  type ApiItem,
  type ApiModel,
  type ApiParameterListMixin,
  type Excerpt,
} from '@microsoft/api-extractor-model'
import type { DocBlock, DocComment, DocNode } from '@microsoft/tsdoc'
import type { BlockContent, Heading, PhrasingContent, Root, RootContent, Text } from 'mdast'
import { squeezeParagraphs } from 'mdast-squeeze-paragraphs'
import {
  DOCUMENTATION_PARENT_ITEMS,
  DOCUMENTATION_SECTION_HEADINGS,
  DOCUMENTATION_SECTION_VISIBILITY,
  DOCUMENTATION_TABLE_COLUMNS,
  type DocumentationSectionVisibility,
} from './constants'
import { createHeadingChildren } from './create-heading-children'
import { createTable } from './create-table'
import { fromApiExcerpt } from './from-api-excerpt'
import {
  DEFAULT_TSDOC_MARKDOWN_WRITER_OPTIONS,
  fromTSDocNode,
  type FromTSDocNodeOptions,
  type TSDocMarkdownWriterOptions,
} from './from-tsdoc-node'
import { isApiItem } from './is-api-item'
import { isDocumentationHidden } from './is-documentation-hidden'
import { isEmpty } from './is-empty'
import { makeListsTight } from './make-lists-tight'
import { normalizeExcerptWhitespace } from './normalize-excerpt-whitespace'
import { removeBrokenAnchorLinks } from './remove-broken-anchor-links'
import { removeEmptyHeadings } from './remove-empty-headings'

export interface ApiMarkdownWriterOptions {
  item: ApiItem
  model: ApiModel
  content?: RootContent[]
  heading?: string | true
  headingDepth?: number
}

type ApiMarkdownWriterState = Pick<
  Required<ApiMarkdownWriterOptions>,
  'content' | 'headingDepth' | 'item' | 'model'
>

export class ApiMarkdownWriter {
  private readonly state: ApiMarkdownWriterState

  constructor(options: ApiMarkdownWriterOptions) {
    this.state = {
      content: options.content ?? [],
      headingDepth: options.headingDepth ?? 0,
      item: options.item,
      model: options.model,
    }

    if (typeof options.heading === 'string') {
      this.heading(options.heading)
    } else if (options.heading === true) {
      this.heading()
    }
  }

  get content() {
    const tree: Root = { children: this.state.content, type: 'root' }
    squeezeParagraphs(tree)
    tree.children = removeEmptyHeadings(tree.children)
    tree.children = removeBrokenAnchorLinks(tree.children)
    tree.children = makeListsTight(tree.children)

    if (isEmpty(tree)) {
      return undefined
    }

    return isEmpty(tree) ? undefined : tree
  }

  private get item() {
    return this.state.item
  }

  private get kind() {
    return this.state.item.kind
  }

  private get model() {
    return this.state.model
  }

  private fork(options?: { headline?: string | true; item?: ApiItem }) {
    const writer = new ApiMarkdownWriter({
      ...this.state,
      content: this.state.content,
      heading: options?.headline,
      item: options?.item ?? this.state.item,
    })

    return writer
  }

  private write(...nodes: RootContent[]): this {
    this.state.content.push(...nodes)

    return this
  }

  private writeTSDocNode(
    node: DocNode,
    options: TSDocMarkdownWriterOptions = DEFAULT_TSDOC_MARKDOWN_WRITER_OPTIONS,
  ) {
    const value = fromTSDocNode({ ...this.state, node, softBreaks: options.softBreaks })
    this.write(...value)
    this.line()

    return this
  }

  private fromApiExcerpt(excerpt?: Excerpt): PhrasingContent[] {
    return fromApiExcerpt({ excerpt, item: this.state.item, model: this.state.model })
  }

  private fromTSDocNode(options: Omit<FromTSDocNodeOptions, 'item' | 'model'>) {
    return fromTSDocNode({ ...options, item: this.item, model: this.model })
  }

  private writeSummarySection(): void {
    const comments = this.tsdocComment
    const summarySection = comments?.summarySection
    if (summarySection === undefined) {
      return
    }

    this.writeTSDocNode(summarySection)
  }

  private writeExcerpt(): void {
    const tokens = this.declaredItem?.excerptTokens
    if (tokens === undefined) {
      return
    }

    const value = (
      normalizeExcerptWhitespace(
        tokens.map((token) => ({ type: 'text', value: token.text })),
      ) as Text[]
    )
      .map(({ value }) => value)
      .join('')

    this.write({
      lang: 'typescript',
      type: 'code',
      value,
    })
  }

  private writeTypeParameters(): void {
    const comments = this.tsdocComment
    const typeParameters = comments?.typeParams
    if (typeParameters === undefined || typeParameters.count === 0) {
      return
    }

    const blocks = typeParameters.blocks
    if (blocks.length === 0) {
      return
    }

    this.writeTableSection({
      headers: DOCUMENTATION_TABLE_COLUMNS.TYPE_PARAMETER,
      headline: DOCUMENTATION_SECTION_HEADINGS.TYPE_PARAMETERS,
      items: blocks,
      mapper: (parameter) => {
        const content = parameter.content
        return [
          [{ type: 'inlineCode', value: parameter.parameterName }],
          content === undefined
            ? undefined
            : this.fromTSDocNode({
                node: content,
                softBreaks: false,
              }),
        ]
      },
    })
  }

  private writeParametersSection(): void {
    const visibility = this.sectionVisibility
    if (visibility.showParameters !== true) {
      return
    }

    const parameterItem = this.item as ApiParameterListMixin
    const parameters = parameterItem.parameters
    if (parameters === undefined || parameters.length === 0) {
      return
    }

    this.writeTableSection({
      headers: DOCUMENTATION_TABLE_COLUMNS.PARAMETER,
      headline: DOCUMENTATION_SECTION_HEADINGS.PARAMETERS,
      items: parameters,
      mapper: (parameter) => {
        const blockContent = parameter.tsdocParamBlock?.content
        return [
          [{ type: 'inlineCode', value: parameter.name }],
          this.fromApiExcerpt(parameter.parameterTypeExcerpt),
          blockContent === undefined
            ? undefined
            : this.fromTSDocNode({
                node: blockContent,
                softBreaks: false,
              }),
        ]
      },
    })
  }

  private writeReturnsSection(): void {
    const visibility = this.sectionVisibility
    if (visibility.showReturns !== true) {
      return
    }

    const comments = this.tsdocComment
    const returnsBlock = comments?.returnsBlock
    if (returnsBlock === undefined) {
      return
    }

    const writer = this.fork({ headline: DOCUMENTATION_SECTION_HEADINGS.RETURNS })
    const section = 'content' in returnsBlock ? returnsBlock.content : returnsBlock
    writer.writeTSDocNode(section)
  }

  private writeThrowsSection(): void {
    const visibility = this.sectionVisibility
    if (visibility.showThrows !== true) {
      return
    }

    const throwsBlocks = this.extractDocumentBlocksByTag('@throws')
    if (throwsBlocks.length === 0) {
      return
    }

    const writer = this.fork({ headline: DOCUMENTATION_SECTION_HEADINGS.THROWS })

    if (throwsBlocks.length === 1) {
      writer.writeTSDocNode(throwsBlocks[0].content)
      return
    }

    writer.write({
      children: throwsBlocks.map(({ content }) => ({
        children: this.fromTSDocNode({ node: content }) as BlockContent[],
        spread: false,
        type: 'listItem' as const,
      })),
      ordered: true,
      type: 'list',
    })
  }

  private writeEnumMembersSection(): void {
    const visibility = this.sectionVisibility
    if (visibility.showEnumMembers !== true) {
      return
    }

    const enumMembers = (this.item.members ?? []).filter(
      (member): member is ApiEnumMember =>
        isApiItem<ApiEnumMember>(member, ApiItemKind.EnumMember) && !isDocumentationHidden(member),
    )

    if (enumMembers.length === 0) {
      return
    }

    this.writeTableSection({
      headers: DOCUMENTATION_TABLE_COLUMNS.ENUM_MEMBER,
      headline: DOCUMENTATION_SECTION_HEADINGS.ENUM_MEMBERS,
      items: enumMembers,
      mapper: (member) => {
        const summarySection = member.tsdocComment?.summarySection
        return [
          [{ type: 'inlineCode', value: member.displayName }],
          this.fromApiExcerpt(member.initializerExcerpt),
          summarySection === undefined
            ? undefined
            : this.fromTSDocNode({
                node: summarySection,
                softBreaks: false,
              }),
        ]
      },
    })
  }

  private writeRemarksSection(): void {
    const comments = this.tsdocComment
    const remarksBlock = comments?.remarksBlock
    if (remarksBlock === undefined) {
      return
    }

    const writer = this.fork({ headline: DOCUMENTATION_SECTION_HEADINGS.REMARKS })
    const section = 'content' in remarksBlock ? remarksBlock.content : remarksBlock
    writer.writeTSDocNode(section)
  }

  private writeExamplesSection(): void {
    const comments = this.tsdocComment
    if (comments === undefined) {
      return
    }

    const examples = this.extractDocumentBlocksByTag('@example')
    if (examples.length === 0) {
      return
    }

    const writer = this.fork({ headline: DOCUMENTATION_SECTION_HEADINGS.EXAMPLES })
    examples.forEach((example) => {
      writer.writeTSDocNode(example.content)
    })
  }

  private writeSections(): void {
    if (this.tsdocComment === undefined) {
      return
    }

    this.writeSummarySection()
    this.writeExcerpt()
    this.writeTypeParameters()
    this.writeParametersSection()
    this.writeReturnsSection()
    this.writeThrowsSection()
    this.writeEnumMembersSection()
    this.writeRemarksSection()
    this.writeExamplesSection()
  }

  writeApiItem(item: ApiItem, options?: { headline?: string | true }): void {
    if (isDocumentationHidden(item)) {
      return
    }

    const writer = this.fork({
      headline: options?.headline ?? true,
      item,
    })

    writer.writeSections()

    if (isApiItem<ApiClass>(writer.item, ApiItemKind.Class)) {
      const ctor = writer.item.members?.find((member): member is ApiConstructor =>
        isApiItem<ApiConstructor>(member, ApiItemKind.Constructor),
      )
      if (ctor !== undefined && !isDocumentationHidden(ctor)) {
        writer.fork({ headline: true, item: ctor }).writeSections()
      }
    }

    const memberKinds = DOCUMENTATION_PARENT_ITEMS[writer.item.kind]
    if (memberKinds === undefined || memberKinds.length === 0) {
      return
    }

    const members = writer.item.members ?? []
    for (const memberKind of memberKinds) {
      for (const member of members) {
        if (member.kind === memberKind && !isDocumentationHidden(member)) {
          writer.fork({ headline: true, item: member }).writeSections()
        }
      }
    }
  }

  private line(): this {
    if (this.state.content.at(-1)?.type !== 'paragraph') {
      return this
    }

    this.write({ children: [], type: 'paragraph' })
    return this
  }

  private heading(value: string | ApiItem = this.state.item): void {
    this.state.headingDepth += 1

    this.write({
      children:
        typeof value === 'string' ? [{ type: 'text', value }] : createHeadingChildren(value),
      depth: this.state.headingDepth as Heading['depth'],
      type: 'heading',
    })

    this.line()
  }

  private get declaredItem(): ApiDeclaredItem | undefined {
    if ('tsdocComment' in this.item) {
      return this.item as ApiDeclaredItem
    }

    return undefined
  }

  private get tsdocComment(): DocComment | undefined {
    return this.declaredItem?.tsdocComment ?? undefined
  }

  private get sectionVisibility(): DocumentationSectionVisibility {
    return DOCUMENTATION_SECTION_VISIBILITY[this.kind] ?? {}
  }

  private extractDocumentBlocksByTag(tagName: string): readonly DocBlock[] {
    const comments = this.tsdocComment
    if (comments === undefined) {
      return []
    }

    return comments.customBlocks.filter((block) => block.blockTag.tagName === tagName)
  }

  private writeTableSection<T>({
    headers,
    headline,
    items,
    mapper,
  }: {
    headers: string[]
    headline: string
    items: readonly T[]
    mapper: (item: T) => Array<RootContent[] | undefined> | undefined
  }): void {
    if (items.length === 0) {
      return
    }

    const rows = items
      .map(mapper)
      .filter((value): value is Array<RootContent[] | undefined> => Array.isArray(value))

    const table = createTable(headers, rows)

    if (table === undefined) {
      return
    }

    this.fork({ headline }).write(table)
  }
}
