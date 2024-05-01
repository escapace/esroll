import type { BuildOptions as ESBuildOptions, OutputFile, PartialMessage } from 'esbuild'
import type { GeneratedCodeOptions, OutputOptions, RollupOptions, TreeshakingOptions } from 'rollup'
import type { IndexedSourceMapConsumer } from 'source-map'

type OmitOptions<T> = Omit<
  T,
  | 'allowOverwrite'
  | 'bundle'
  | 'entryPoints'
  | 'format'
  | 'globalName'
  | 'metafile'
  | 'minify'
  | 'outdir'
  | 'outfile'
  | 'preserveSymlinks'
  | 'sourcemap'
  | 'stdin'
  | 'write'
>

export type LogLevel = Exclude<BuildOptions['logLevel'], undefined>

export interface BuildOptions extends OmitOptions<ESBuildOptions> {
  entryPoints: string[]
  outdir: string
  logLevel?: 'error' | 'info' | 'silent'
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
    treeshake?: TreeshakingOptions
  } & Partial<Pick<RollupOptions, 'experimentalLogSideEffects' | 'maxParallelFileOps'>>
  sourcemap?: 'external' | 'inline' | 'linked' | boolean
}

// export type BuildResult<T extends BuildOptions> = Pick<
//   ESBuildResult<T>,
//   'errors' | 'outputFiles' | 'warnings'
// >

export interface BuildResult {
  errors: PartialMessage[]
  /** Only when "write: false" */
  outputFiles: Array<Pick<OutputFile, 'path'>>
  warnings: PartialMessage[]
  /** Only when "metafile: true" */
  // metafile: Metafile
}

export type SourceMapConsumers = Partial<Record<string, IndexedSourceMapConsumer>>

export interface TransformFailure {
  errors?: PartialMessage[]
  warnings?: PartialMessage[]
}
