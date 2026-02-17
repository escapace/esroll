import type { Link, Text } from 'mdast'
import { describe, expect, it } from 'vitest'
import { normalizeExcerptWhitespace } from './normalize-excerpt-whitespace'

describe('normalizeExcerptWhitespace', () => {
  it('normalizes multi-line content with indentation and links', () => {
    const content: Array<Link | Text> = [
      { type: 'text', value: '  reset(options?: {\n' },
      { type: 'text', value: '        keepContext?: boolean;  \n' },
      { type: 'text', value: '        keepSubscriptions?:   boolean;\n' },
      { type: 'text', value: '    } & Partial<' },
      {
        children: [
          { type: 'text', value: 'Snaproll\n' },
          { type: 'text', value: 'Options' },
        ],
        type: 'link',
        url: '#snaproll',
      },
      { type: 'text', value: '>): void;  ' },
    ]

    const result = normalizeExcerptWhitespace(content)

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "text",
          "value": "reset(options?: {
      ",
        },
        {
          "type": "text",
          "value": "  keepContext?: boolean;
      ",
        },
        {
          "type": "text",
          "value": "  keepSubscriptions?: boolean;
      ",
        },
        {
          "type": "text",
          "value": "} & Partial<",
        },
        {
          "children": [
            {
              "type": "text",
              "value": "Snaproll Options",
            },
          ],
          "type": "link",
          "url": "#snaproll",
        },
        {
          "type": "text",
          "value": ">): void;",
        },
      ]
    `)
  })

  it('normalizes content with single middle line and link', () => {
    const content: Array<Link | Text> = [
      { type: 'text', value: 'subscribe(value: ' },
      {
        children: [{ type: 'text', value: 'SnaprollSubscription' }],
        type: 'link',
        url: '#subscription',
      },
      { type: 'text', value: ',  options?: {\n' },
      { type: 'text', value: '        immediate?:  boolean;  \n' },
      { type: 'text', value: '    }):   SnaprollSubscriptionControls;' },
    ]

    const result = normalizeExcerptWhitespace(content)

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "text",
          "value": "subscribe(value: ",
        },
        {
          "children": [
            {
              "type": "text",
              "value": "SnaprollSubscription",
            },
          ],
          "type": "link",
          "url": "#subscription",
        },
        {
          "type": "text",
          "value": ", options?: {
      ",
        },
        {
          "type": "text",
          "value": "  immediate?: boolean;
      ",
        },
        {
          "type": "text",
          "value": "}): SnaprollSubscriptionControls;",
        },
      ]
    `)
  })

  it('normalizes nested multi-line content with link containing newline', () => {
    const content: Array<Link | Text> = [
      { type: 'text', value: "  declare   module  '" },
      {
        children: [
          { type: 'text', value: 'snap\n' },
          { type: 'text', value: 'roll' },
        ],
        type: 'link',
        url: '#snaproll',
      },
      { type: 'text', value: "'  {\n" },
      { type: 'text', value: '  interface  SnaprollUserContext  {  \n' },
      { type: 'text', value: '    score:  number\n' },
      { type: 'text', value: '  }  \n' },
      { type: 'text', value: '  }  ' },
    ]

    const result = normalizeExcerptWhitespace(content)

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "text",
          "value": "declare module '",
        },
        {
          "children": [
            {
              "type": "text",
              "value": "snap roll",
            },
          ],
          "type": "link",
          "url": "#snaproll",
        },
        {
          "type": "text",
          "value": "' {
      ",
        },
        {
          "type": "text",
          "value": "  interface SnaprollUserContext {
      ",
        },
        {
          "type": "text",
          "value": "    score: number
      ",
        },
        {
          "type": "text",
          "value": "  }
      ",
        },
        {
          "type": "text",
          "value": "  }",
        },
      ]
    `)
  })
})
