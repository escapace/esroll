import type { Loader, Metafile } from 'esbuild'
import path from 'node:path'

type ResolvedLoader = 'global-css' | Loader

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

interface OutputExtensions {
  css: string
  js: string
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

type OutputRecord = { requiresImportAttributes: boolean } & EsbuildOutputCatalogEntry

type JavaScriptEntryOutputRecord = { kind: 'js-entry' } & OutputRecord

type OutputExtensionKind = 'asset' | 'css' | 'module'
type SemanticOutputKind = OutputExtensionKind

const LOADERS_EMITTING_ASSETS = new Set<ResolvedLoader>(['copy', 'file'])
const LOADERS_EMITTING_CSS = new Set<ResolvedLoader>(['css', 'global-css', 'local-css'])

const isAssetLoader = (loader: ResolvedLoader) => LOADERS_EMITTING_ASSETS.has(loader)
const isCSSLoader = (loader: ResolvedLoader) => LOADERS_EMITTING_CSS.has(loader)

const classifyOutputExtension = (
  pathOutput: string,
  outputExtensions: OutputExtensions,
): OutputExtensionKind => {
  if (pathOutput.endsWith(outputExtensions.js)) {
    return 'module'
  }

  if (pathOutput.endsWith(outputExtensions.css)) {
    return 'css'
  }

  return 'asset'
}

const classifySemanticOutput = (options: {
  exports: string[]
  imports: Array<{ kind: string }>
  loaders: ResolvedLoader[]
  outputExtensions: OutputExtensions
  pathOutput: string
  entryPointLoader?: ResolvedLoader
}): SemanticOutputKind => {
  const outputExtensionKind = classifyOutputExtension(options.pathOutput, options.outputExtensions)
  const hasInputs = options.loaders.length !== 0

  if (!hasInputs) {
    if (options.entryPointLoader !== undefined) {
      if (isCSSLoader(options.entryPointLoader)) {
        return 'css'
      }

      if (isAssetLoader(options.entryPointLoader)) {
        return 'asset'
      }
    }

    return outputExtensionKind
  }

  if (options.loaders.every(isAssetLoader)) {
    // Asset loaders can still produce JavaScript wrappers for entry points, so a `.js` output is
    // only a Rollup input when esbuild's metafile reports module linkage for that output.
    const emitsJavaScriptModule = options.exports.length !== 0 || options.imports.length !== 0

    return outputExtensionKind === 'module' && emitsJavaScriptModule ? 'module' : 'asset'
  }

  return outputExtensionKind
}

const refineOutputKind = (
  semanticKind: SemanticOutputKind,
  entryPoint: string | undefined,
): EsbuildOutputCatalogEntry['kind'] =>
  semanticKind === 'module' ? (entryPoint === undefined ? 'js-chunk' : 'js-entry') : semanticKind

const isJavaScriptEntryOutput = (value: OutputRecord): value is JavaScriptEntryOutputRecord =>
  value.kind === 'js-entry'

const isPassthroughOutput = (value: OutputRecord): value is EsbuildPassthroughOutput =>
  value.kind === 'asset' || value.kind === 'css'

export const createEsbuildOutputCatalog = (options: {
  loaders: Record<string, Loader | undefined>
  metafile: Metafile
  outputExtensions: OutputExtensions
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
      const inputPaths = Object.keys(value.inputs)
      const loaders = inputPaths.map((inputPath) =>
        resolveLoader(path.resolve(pathDirectoryPackage, inputPath)),
      )
      const semanticKind = classifySemanticOutput({
        entryPointLoader:
          typeof value.entryPoint === 'string'
            ? resolveLoader(path.resolve(pathDirectoryPackage, value.entryPoint))
            : undefined,
        exports: value.exports,
        imports: value.imports,
        loaders,
        outputExtensions: options.outputExtensions,
        pathOutput,
      })
      const kind = refineOutputKind(semanticKind, value.entryPoint)

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
          inputPaths.some((inputPath) =>
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
