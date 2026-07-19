import { TSDocConfiguration, TSDocTagDefinition, TSDocTagSyntaxKind } from '@microsoft/tsdoc'
import { describe, expect, it } from 'vitest'
import { DOCUMENTATION_HIDDEN_TAG_NAME } from '../create-documentation/constants'
import { configureDocumentationHiddenTag } from './configure-documentation-hidden-tag'

describe('configureDocumentationHiddenTag', () => {
  it('registers and supports the documentation hidden modifier', () => {
    const configuration = new TSDocConfiguration()

    configureDocumentationHiddenTag(configuration)

    const definition = configuration.tryGetTagDefinition(DOCUMENTATION_HIDDEN_TAG_NAME)
    expect(definition?.syntaxKind).toBe(TSDocTagSyntaxKind.ModifierTag)
    expect(definition === undefined ? false : configuration.isTagSupported(definition)).toBe(true)
  })

  it('supports an existing compatible definition', () => {
    const configuration = new TSDocConfiguration()
    const definition = new TSDocTagDefinition({
      syntaxKind: TSDocTagSyntaxKind.ModifierTag,
      tagName: DOCUMENTATION_HIDDEN_TAG_NAME,
    })
    configuration.addTagDefinition(definition)

    configureDocumentationHiddenTag(configuration)

    expect(configuration.tryGetTagDefinition(DOCUMENTATION_HIDDEN_TAG_NAME)).toBe(definition)
    expect(configuration.isTagSupported(definition)).toBe(true)
  })

  it.each([TSDocTagSyntaxKind.BlockTag, TSDocTagSyntaxKind.InlineTag])(
    'rejects an existing incompatible syntax kind (%s)',
    (syntaxKind) => {
      const configuration = new TSDocConfiguration()
      configuration.addTagDefinition(
        new TSDocTagDefinition({
          syntaxKind,
          tagName: DOCUMENTATION_HIDDEN_TAG_NAME,
        }),
      )

      expect(() => configureDocumentationHiddenTag(configuration)).toThrow(
        '@hidden must be defined as a TSDoc modifier tag when documentation is enabled',
      )
    },
  )
})
