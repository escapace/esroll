import '@microsoft/api-extractor-model'

declare module '@microsoft/api-extractor-model' {
  export interface ApiItemMetadata {
    extends: Set<ApiItem>
    extendsComplete: Set<ApiItem>
    parents: Set<ApiItem>
    filePath?: string
    url?: string
  }

  interface ApiItem {
    metadata: ApiItemMetadata
  }
}
