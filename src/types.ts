import type { BuildOptions as ESBuildOptions, OutputFile, PartialMessage } from 'esbuild'
import type {
  GeneratedCodeOptions,
  OutputOptions,
  Plugin,
  RollupOptions,
  TreeshakingOptions,
} from 'rollup'
import type { IndexedSourceMapConsumer } from 'source-map'

export type BuildLogLevel = Exclude<BuildOptions['logLevel'], undefined>

/**
 * ESBuild options that esroll manages internally and excludes from user configuration.
 */
export type BuildOptionsExcluded =
  | 'absPaths'
  | 'allowOverwrite'
  | 'bundle'
  | 'entryPoints'
  | 'format'
  | 'globalName'
  | 'metafile'
  | 'minify'
  | 'outdir'
  | 'outfile'
  | 'sourcemap'
  | 'stdin'
  | 'tsconfigRaw'
  | 'write'

/**
 * Configuration options for the build process.
 *
 * Extends esbuild's build options while omitting options that conflict with the esroll's internal
 * behavior. Adds support for declaration file generation, documentation extraction, and rollup
 * integration.
 */
export interface BuildOptions extends Omit<ESBuildOptions, BuildOptionsExcluded> {
  /**
   * Entry point files to bundle.
   */
  entryPoints: string[]

  /**
   * Generate TypeScript declaration files (.d.ts).
   *
   * @remarks
   *
   * Either this property or {@link BuildOptions.outdir | outdir} must be set. When enabled,
   * declaration files are generated alongside documentation extraction.
   */
  declaration?: boolean

  /**
   * Bundle declaration files.
   *
   * @remarks
   *
   * Requires {@link BuildOptions.declaration | declaration} to be true.
   */
  declarationRollup?: boolean

  /**
   * Package declarations to bundle with declaration rollup.
   *
   * @remarks
   *
   * Requires {@link BuildOptions.declarationRollup | declarationRollup} to be true.
   */
  declarationRollupPackages?: string[]

  /**
   * Generate API documentation.
   *
   * @remarks
   *
   * Requires {@link BuildOptions.declaration | declaration} to be true. When set to `true`,
   * documentation is generated and either replaces or appends the matching section in `README.md`.
   * When set to a string, the value identifies an alternate markdown file that must sit directly
   * inside the package directory and receives the same replacement or append behavior described by
   * {@link BuildOptions.documentationHeading | documentationHeading}.
   */
  documentation?: boolean | string

  /**
   * Include forgotten exports in the documentation.
   *
   * @remarks
   *
   * Requires {@link BuildOptions.documentation | documentation} to be true.
   */
  documentationIncludeForgottenExports?: boolean

  /**
   * Markdown heading that identifies the API documentation section.
   *
   * @remarks
   *
   * The value must include the leading `#` markers, whose count determines the required heading
   * depth. External markdown provided through {@link BuildOptions.documentation | documentation}
   * must contain a heading whose depth and text match this configuration; matching sections are
   * replaced and the content is appended when no matching heading exists. Applies when {@link
   * BuildOptions.documentation | documentation} is `true` or set to a string.
   *
   * @defaultValue '# API'
   */
  documentationHeading?: string

  /**
   * Logging verbosity level.
   *
   * @defaultValue 'info'
   */
  logLevel?: 'error' | 'info' | 'silent'

  /**
   * Output file directory for bundled source files.
   *
   * @remarks
   *
   * At least one of {@link BuildOptions.outdir | outdir} or {@link BuildOptions.declaration |
   * declaration} must be set. When specified, source files are bundled to this directory.
   */
  outdir?: string

  /**
   * Rollup bundler configuration.
   */
  rollup?: {
    output?: { generatedCode?: GeneratedCodeOptions } & Partial<
      Pick<
        OutputOptions,
        | 'exports'
        | 'externalImportAttributes'
        | 'importAttributesKey'
        | 'minifyInternalExports'
        | 'sanitizeFileName'
        // | 'experimentalMinChunkSize'
        // | 'sourcemapIgnoreList'
        // | 'sourcemapPathTransform'
      >
    >
    plugins?: Plugin[]
    treeshake?: TreeshakingOptions
  } & Partial<Pick<RollupOptions, 'experimentalLogSideEffects' | 'maxParallelFileOps'>>

  /**
   * Source map generation mode.
   *
   * @remarks
   *
   * Controls whether and how source maps are generated for the bundled output.
   *
   * - When set to false or undefined, no source maps are produced.
   *
   * - When set to true or 'linked', the bundler generates separate .map files alongside the output
   *   files and appends a sourceMappingURL comment to each output file that references its
   *   corresponding map file location.
   *
   * - The 'inline' mode embeds source maps directly into the output files as base64-encoded data
   *   URIs.
   *
   * - The 'external' mode writes source maps to separate .map files alongside the output files but
   *   omits the sourceMappingURL comment
   *
   */
  sourcemap?: boolean | 'external' | 'inline' | 'linked'
}

/**
 * Result of a build operation.
 */
export interface BuildResult {
  /**
   * Errors that occurred during the build.
   */
  errors: PartialMessage[]
  /**
   * Paths of generated output files.
   */
  outputFiles: Array<Pick<OutputFile, 'path'>>
  /**
   * Warnings that occurred during the build.
   */
  warnings: PartialMessage[]
}

export type BuildSourceMapConsumers = Partial<
  Record<
    string,
    {
      consumer: IndexedSourceMapConsumer
      map: string
      pathDirectoryOutput: string
    }
  >
>

export type BuildMessages = Pick<BuildResult, 'errors' | 'warnings'>

export interface CommonOptions extends BuildOptions {
  hasColor: boolean
  logLevel: 'error' | 'info' | 'silent'
  pathDirectoryPackage: string
  result: BuildResult
  pathFilePackageJSON?: string
  pathFileTSConfig?: string
}
