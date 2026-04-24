import type { Loader, Metafile } from 'esbuild'
import assert from 'node:assert'
import path from 'node:path'

type ResolvedLoader = 'global-css' | Loader

const LOADERS_EMITTING_ASSETS = new Set<ResolvedLoader>(['copy', 'file'])
const LOADERS_EMITTING_CSS = new Set<ResolvedLoader>(['css', 'global-css', 'local-css'])
const LOADERS_EMITTING_MODULES = new Set<ResolvedLoader>([
  'base64',
  'binary',
  'dataurl',
  'empty',
  'js',
  'json',
  'jsx',
  'text',
  'ts',
  'tsx',
])

export interface EsbuildOutputCatalogEntry {
  absolutePath: string
  kind: 'asset' | 'css' | 'js-chunk' | 'js-entry'
  relativePath: string
  entryPoint?: string
  mapAbsolutePath?: string
}

export type EsbuildPassthroughOutput =
  | ({
      kind: 'asset'
      requiresImportAttributes: boolean
    } & EsbuildOutputCatalogEntry)
  | ({
      kind: 'css'
      requiresImportAttributes: boolean
    } & EsbuildOutputCatalogEntry)

export interface EsbuildOutputCatalog {
  copiedOutputsRequiringImportAttributes: EsbuildPassthroughOutput[]
  javascriptEntries: Array<{ kind: 'js-entry' } & EsbuildOutputCatalogEntry>
  outputs: EsbuildOutputCatalogEntry[]
  passthroughExternalPaths: Set<string>
  passthroughOutputs: EsbuildPassthroughOutput[]
}

const createLoaderResolver = (loaders: Record<string, Loader | undefined>) => {
  const entries = Object.entries(loaders)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => b.length - a.length)

  return (pathFile: string): ResolvedLoader => {
    const explicit = entries.find(([extension]) => pathFile.endsWith(extension))?.[1]

    if (explicit !== undefined) {
      return explicit
    }

    if (pathFile.endsWith('.module.css')) {
      return 'local-css'
    }

    if (pathFile.endsWith('.css')) {
      return 'css'
    }

    if (pathFile.endsWith('.json')) {
      return 'json'
    }

    if (pathFile.endsWith('.txt')) {
      return 'text'
    }

    if (pathFile.endsWith('.tsx')) {
      return 'tsx'
    }

    if (pathFile.endsWith('.cts') || pathFile.endsWith('.mts') || pathFile.endsWith('.ts')) {
      return 'ts'
    }

    if (pathFile.endsWith('.jsx')) {
      return 'jsx'
    }

    if (pathFile.endsWith('.cjs') || pathFile.endsWith('.mjs') || pathFile.endsWith('.js')) {
      return 'js'
    }

    if (!path.basename(pathFile).includes('.')) {
      return 'js'
    }

    throw new Error(`Internal error: unable to resolve loader for ${pathFile}`)
  }
}

const classifyOutput = (
  loaders: ResolvedLoader[],
  pathOutput: string,
): EsbuildOutputCatalogEntry['kind'] => {
  const emitsAssets = loaders.some((loader) => LOADERS_EMITTING_ASSETS.has(loader))
  const emitsCSS = loaders.some((loader) => LOADERS_EMITTING_CSS.has(loader))
  const emitsModules = loaders.some((loader) => LOADERS_EMITTING_MODULES.has(loader))

  if (emitsModules) {
    return 'js-chunk'
  }

  if (emitsCSS && !emitsAssets) {
    return 'css'
  }

  if (emitsAssets && !emitsCSS) {
    return 'asset'
  }

  throw new Error(
    `Internal error: unable to classify esbuild output ${pathOutput} from loaders ${loaders.join(', ')}`,
  )
}

type OutputRecord = { requiresImportAttributes: boolean } & EsbuildOutputCatalogEntry

type JavaScriptEntryOutputRecord = { kind: 'js-entry' } & OutputRecord

const isJavaScriptEntryOutput = (value: OutputRecord): value is JavaScriptEntryOutputRecord =>
  value.kind === 'js-entry'

const isPassthroughOutput = (value: OutputRecord): value is EsbuildPassthroughOutput =>
  value.kind === 'asset' || value.kind === 'css'

export const createEsbuildOutputCatalog = (options: {
  loaders: Record<string, Loader | undefined>
  metafile: Metafile
  pathDirectoryPackage: string
  pathDirectoryTemporary: string
}): EsbuildOutputCatalog => {
  const { metafile, pathDirectoryPackage, pathDirectoryTemporary } = options
  const resolveLoader = createLoaderResolver(options.loaders)
  const pathsOutput = new Set(
    Object.keys(metafile.outputs).map((pathFile) => path.resolve(pathFile)),
  )
  const sourceFilesImportedWithAttributes = new Set<string>()

  for (const input of Object.values(metafile.inputs)) {
    for (const value of input.imports) {
      if (value.with === undefined) {
        continue
      }

      const pathAbsoluteImported = path.resolve(pathDirectoryPackage, value.path)

      if (resolveLoader(pathAbsoluteImported) === 'copy') {
        sourceFilesImportedWithAttributes.add(pathAbsoluteImported)
      }
    }
  }

  const outputs: OutputRecord[] = Object.entries(metafile.outputs)
    .filter(([pathOutput]) => !pathOutput.endsWith('.map'))
    .map(([pathOutput, value]) => {
      const pathAbsolute = path.resolve(pathOutput)
      const loaders = Object.keys(value.inputs).map((inputPath) =>
        resolveLoader(path.resolve(pathDirectoryPackage, inputPath)),
      )

      assert(loaders.length !== 0, `Internal error: esbuild output ${pathOutput} has no inputs`)

      const kindBase = classifyOutput(loaders, pathOutput)
      const kind =
        kindBase === 'js-chunk' && typeof value.entryPoint === 'string' ? 'js-entry' : kindBase

      return {
        absolutePath: pathAbsolute,
        entryPoint: value.entryPoint,
        kind,
        mapAbsolutePath: pathsOutput.has(path.resolve(`${pathOutput}.map`))
          ? path.resolve(`${pathOutput}.map`)
          : undefined,
        relativePath: path.relative(pathDirectoryTemporary, pathAbsolute),
        requiresImportAttributes:
          kind === 'asset' &&
          loaders.every((loader) => loader === 'copy') &&
          Object.keys(value.inputs).some((inputPath) =>
            sourceFilesImportedWithAttributes.has(path.resolve(pathDirectoryPackage, inputPath)),
          ),
      }
    })

  const passthroughOutputs = outputs.filter(isPassthroughOutput)

  return {
    copiedOutputsRequiringImportAttributes: passthroughOutputs.filter(
      (value) => value.requiresImportAttributes,
    ),
    javascriptEntries: outputs
      .filter(isJavaScriptEntryOutput)
      .map(({ requiresImportAttributes: _, ...value }) => value),
    outputs: outputs.map(({ requiresImportAttributes: _, ...value }) => value),
    passthroughExternalPaths: new Set(passthroughOutputs.map((value) => value.absolutePath)),
    passthroughOutputs,
  }
}
