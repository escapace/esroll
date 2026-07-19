import { type TSDocConfiguration, TSDocTagDefinition, TSDocTagSyntaxKind } from '@microsoft/tsdoc'
import { DOCUMENTATION_HIDDEN_TAG_NAME } from '../create-documentation/constants'

/**
 * Registers esroll's documentation-only `@hidden` modifier with API Extractor.
 *
 * @remarks
 *
 * A compatible project definition is reused and marked as supported. A block or inline definition
 * fails explicitly because interpreting the same tag with different syntax would be ambiguous.
 *
 * @param configuration - TSDoc configuration used for API extraction.
 */
export function configureDocumentationHiddenTag(configuration: TSDocConfiguration): void {
  let definition = configuration.tryGetTagDefinition(DOCUMENTATION_HIDDEN_TAG_NAME)

  if (definition === undefined) {
    definition = new TSDocTagDefinition({
      syntaxKind: TSDocTagSyntaxKind.ModifierTag,
      tagName: DOCUMENTATION_HIDDEN_TAG_NAME,
    })
    configuration.addTagDefinition(definition)
  } else if (definition.syntaxKind !== TSDocTagSyntaxKind.ModifierTag) {
    throw new Error(
      `${DOCUMENTATION_HIDDEN_TAG_NAME} must be defined as a TSDoc modifier tag when documentation is enabled`,
    )
  }

  configuration.setSupportForTag(definition, true)
}
