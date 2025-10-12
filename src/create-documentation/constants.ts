import { ApiItemKind } from '@microsoft/api-extractor-model'

export interface DocumentationSectionVisibility {
  showEnumMembers?: boolean
  showParameters?: boolean
  showReturns?: boolean
  showThrows?: boolean
}

export const DOCUMENTATION_TABLE_COLUMNS = {
  ENUM_MEMBER: ['Member', 'Value', 'Description'],
  PARAMETER: ['Parameter', 'Type', 'Description'],
  TYPE_PARAMETER: ['Parameter', 'Description'],
}

export const DOCUMENTATION_SECTION_HEADINGS = {
  ENUM_MEMBERS: 'Members',
  EXAMPLES: 'Examples',
  PARAMETERS: 'Parameters',
  REMARKS: 'Remarks',
  RETURNS: 'Returns',
  THROWS: 'Throws',
  TYPE_PARAMETERS: 'Type Parameters',
} as const

export const DOCUMENTATION_SECTION_VISIBILITY: Partial<
  Record<ApiItemKind, DocumentationSectionVisibility>
> = {
  [ApiItemKind.CallSignature]: {
    showParameters: true,
    showReturns: true,
    showThrows: true,
  },
  [ApiItemKind.Constructor]: { showParameters: true, showThrows: true },
  [ApiItemKind.Enum]: { showEnumMembers: true },
  [ApiItemKind.Function]: { showParameters: true, showReturns: true, showThrows: true },
  [ApiItemKind.Method]: { showParameters: true, showReturns: true, showThrows: true },
  [ApiItemKind.MethodSignature]: { showParameters: true, showReturns: true, showThrows: true },
}

export const DOCUMENTATION_PARENT_ITEMS: Partial<Record<ApiItemKind, ApiItemKind[]>> = {
  [ApiItemKind.Class]: [ApiItemKind.Method, ApiItemKind.Property],
  [ApiItemKind.Interface]: [
    ApiItemKind.CallSignature,
    ApiItemKind.MethodSignature,
    ApiItemKind.PropertySignature,
  ],
}

export const DOCUMENTATION_TOP_LEVEL_ITEMS: ApiItemKind[] = [
  ApiItemKind.Function,
  ApiItemKind.Class,
  ApiItemKind.Variable,
  ApiItemKind.Enum,
  ApiItemKind.Interface,
  ApiItemKind.TypeAlias,
]
