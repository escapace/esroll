import type { Link, Text } from 'mdast'
import type { ProjectionAdapter, Segment } from '../format-with-string-formatter'

export interface LinkTextOpaque {
  text: string
  url: string
  title?: string | null | undefined
}

export const linkTextExcerptAdapter: ProjectionAdapter<
  Array<Link | Text>,
  LinkTextOpaque,
  undefined
> = {
  fromSegments(options) {
    const nodes: Array<Link | Text> = []

    for (const segment of options.segments) {
      if (segment.kind === 'text') {
        nodes.push(...splitTextByNewline(segment.value))
        continue
      }

      const link: Link = {
        children: [{ type: 'text', value: segment.value.text }],
        type: 'link',
        url: segment.value.url,
      }

      if (segment.value.title !== undefined) {
        link.title = segment.value.title
      }

      nodes.push(link)
    }

    return nodes
  },
  toSegments(source) {
    const segments: Array<Segment<LinkTextOpaque>> = source.map((node) => {
      if (node.type === 'text') {
        return {
          kind: 'text',
          value: node.value,
        }
      }

      return {
        kind: 'opaque',
        value: {
          text: toLinkText(node),
          title: node.title,
          url: node.url,
        },
      }
    })

    return {
      complement: undefined,
      segments,
    }
  },
}

function toLinkText(link: Link): string {
  const text = link.children
    .filter((child): child is Text => child.type === 'text')
    .map((child) => child.value)
    .join('')

  return text.replace(/\r?\n/g, ' ')
}

function splitTextByNewline(value: string): Text[] {
  const parts = value.split(/\r?\n/)
  const textNodes: Text[] = []

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]
    const isLast = index === parts.length - 1

    if (part.length > 0 || !isLast) {
      textNodes.push({
        type: 'text',
        value: isLast ? part : `${part}\n`,
      })
    }
  }

  return textNodes
}
