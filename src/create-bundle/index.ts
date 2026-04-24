import commonPathPrefix from 'common-path-prefix'
import { build as esbuild, type BuildOptions as ESBuildOptions } from 'esbuild'
import isPathInside from 'is-path-inside'
import { omit } from 'es-toolkit'
import assert from 'node:assert'
import { mkdtemp, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import prettyBytes from 'pretty-bytes'
import { rollup, type LogLevelOption as RollupLogLevel, type RollupOptions } from 'rollup'
import * as zx from 'zx'
import { pluginPublicPathChunkImports } from './plugin-public-path-chunk-imports'
import { pluginPublicPathImports } from './plugin-public-path-imports'
import { pluginSourcemaps } from './plugin-sourcemaps'
import type { BuildLogLevel, CommonOptions } from '../types'
import { createHandlerRollupLog } from './create-handler-rollup-log'
import { createEsbuildOutputCatalog } from './create-esbuild-output-catalog'
import { createSourcemapConsumers } from './create-sourcemap-consumers'
import { createTable } from './create-table'
import { scoreFile } from './score-file'
import { writePassthroughOutputs } from './write-passthrough-outputs'
import { normalizeCommonPathPrefixInput } from '../utilities/normalize-common-path-prefix-input'

const createChunkFileNames = (
  chunkNames: string | undefined,
  pathExtensionOutputJavaScript: string,
) =>
  `${(chunkNames ?? '[name]-[hash]').replaceAll('[ext]', pathExtensionOutputJavaScript.slice(1))}${pathExtensionOutputJavaScript}`

export const createBundle = async (options: CommonOptions) => {
  const { hasColor, logLevel, pathDirectoryPackage, result } = options
  const { outputFiles, ...messages } = result

  if (typeof options.outdir !== 'string') {
    return
  }

  const pathDirectoryTemporary = await mkdtemp(path.join(os.tmpdir(), 'esroll'))
  const pathDirectoryOutput = path.resolve(pathDirectoryPackage, options.outdir)
  assert(isPathInside(pathDirectoryOutput, pathDirectoryPackage))

  process.chdir(pathDirectoryPackage)

  const esbuildOptions = {
    preserveSymlinks: false,
    ...(omit(options, [
      'declaration',
      'declarationRollup',
      'declarationRollupPackages',
      'documentation',
      'hasColor',
      'pathDirectoryPackage',
      'pathFilePackageJSON',
      'pathFileTSConfig',
      'result',
      'rollup',
    ]) as ESBuildOptions),
    absPaths: undefined,
    absWorkingDir: pathDirectoryPackage,
    allowOverwrite: true,
    bundle: true,
    color: hasColor,
    format: 'esm',
    globalName: undefined,
    lineLimit:
      options.lineLimit ??
      ([options.minifyIdentifiers, options.minifySyntax, options.minifyWhitespace].some(
        (value) => value === true,
      )
        ? 100
        : undefined),
    logLevel: 'silent',
    metafile: true,
    minify: false,
    outdir: pathDirectoryTemporary,
    outExtension: { '.js': '.js', ...options.outExtension },
    outfile: undefined,
    sourcemap: 'external',
    sourceRoot: undefined,
    stdin: undefined,
    tsconfigRaw: undefined,
    write: true,
  } satisfies ESBuildOptions

  try {
    const resultESBuild = await esbuild(esbuildOptions)

    assert(
      resultESBuild.metafile?.outputs !== undefined,
      'Internal error: esbuild metafile outputs are undefined',
    )

    messages.errors.push(...resultESBuild.errors)
    messages.warnings.push(...resultESBuild.warnings)

    const outputCatalog = createEsbuildOutputCatalog({
      loaders: options.loader ?? {},
      metafile: resultESBuild.metafile,
      pathDirectoryPackage,
      pathDirectoryTemporary,
    })
    const externalImportAttributes = options.rollup?.output?.externalImportAttributes ?? true

    assert(
      externalImportAttributes || outputCatalog.copiedOutputsRequiringImportAttributes.length === 0,
      'options.rollup.output.externalImportAttributes must not be false when copied imports use import attributes',
    )

    const sourceMapConsumers = await createSourcemapConsumers(resultESBuild.metafile)
    const handlerRollupLog = createHandlerRollupLog({
      messages,
      pathDirectoryPackage,
      pathDirectoryTemporary,
      sourceMapConsumers,
    })
    const pathEntryPoints = new Set(
      options.entryPoints.map((value) => path.resolve(pathDirectoryPackage, value)),
    )
    const inputRollup = Object.fromEntries(
      outputCatalog.javascriptEntries
        .filter(
          (value) =>
            typeof value.entryPoint === 'string' &&
            pathEntryPoints.has(path.resolve(pathDirectoryPackage, value.entryPoint)),
        )
        .map((value) => [value.relativePath, value.absolutePath] as const),
    )
    const pathPublicBase = options.publicPath?.replace(/\/+$/, '')
    const importsPublicPath = new Map<string, string>(
      pathPublicBase === undefined
        ? []
        : outputCatalog.outputs
            .filter((value) => value.kind === 'js-chunk' || value.kind === 'js-entry')
            .map(
              (value) =>
                [
                  `${pathPublicBase}/${value.relativePath.replaceAll('\\', '/')}`,
                  value.absolutePath,
                ] as const,
            ),
    )
    const optionsRollupOutput = {
      chunkFileNames: createChunkFileNames(options.chunkNames, esbuildOptions.outExtension['.js']),
      dir: options.outdir,
      exports: options.rollup?.output?.exports ?? 'auto',
      externalImportAttributes,
      externalLiveBindings: false,
      format: 'esm',
      freeze: false,
      generatedCode: {
        constBindings: options.supported?.['const-and-let'] === true,
        objectShorthand: true,
        preset: 'es2015',
        ...options.rollup?.output?.generatedCode,
      },
      importAttributesKey: options.rollup?.output?.importAttributesKey ?? 'with',
      indent: false,
      inlineDynamicImports: false,
      interop: 'esModule',
      minifyInternalExports: options.rollup?.output?.minifyInternalExports ?? false,
      preserveModules: true,
      preserveModulesRoot:
        options.outbase ??
        (options.entryPoints.length === 1
          ? path.dirname(options.entryPoints[0])
          : commonPathPrefix(options.entryPoints.map(normalizeCommonPathPrefixInput))),
      sanitizeFileName: options.rollup?.output?.sanitizeFileName,
      sourcemap:
        options.sourcemap === undefined || options.sourcemap === false
          ? false
          : options.sourcemap === 'linked' || options.sourcemap === true
            ? true
            : options.sourcemap === 'inline'
              ? 'inline'
              : options.sourcemap === 'external'
                ? 'hidden'
                : undefined,
      sourcemapBaseUrl: options.sourceRoot,
      sourcemapExcludeSources: !(esbuildOptions.sourcesContent === true),
      validate: true,
      entryFileNames: (value: { isEntry: boolean; name: string }) =>
        value.isEntry ? value.name : `${value.name}${esbuildOptions.outExtension['.js']}`,
    } satisfies NonNullable<RollupOptions['output']>
    const optionsRollup = {
      experimentalLogSideEffects: options.rollup?.experimentalLogSideEffects,
      input: inputRollup,
      logLevel: (
        {
          error: 'warn',
          info: 'debug',
          silent: 'silent',
        } satisfies Record<BuildLogLevel, RollupLogLevel>
      )[logLevel],
      maxParallelFileOps: options.rollup?.maxParallelFileOps,
      plugins: [
        ...(options.rollup?.plugins ?? []),
        pluginPublicPathImports(importsPublicPath),
        pluginSourcemaps(sourceMapConsumers),
        pluginPublicPathChunkImports(options.publicPath),
      ].filter((value) => value !== undefined),
      preserveEntrySignatures: 'exports-only',
      preserveSymlinks: false,
      strictDeprecations: true,
      treeshake: {
        correctVarValueBeforeDeclaration: false,
        manualPureFunctions: options.pure,
        moduleSideEffects: true,
        preset: 'recommended',
        tryCatchDeoptimization: false,
        unknownGlobalSideEffects: false,
        ...options.rollup?.treeshake,
      },
      external: (id: string, importer: string | undefined) => {
        if (importsPublicPath.has(id)) {
          return false
        }

        if (!id.startsWith('.') && !path.isAbsolute(id)) {
          return true
        }

        const pathResolved = path.isAbsolute(id)
          ? path.resolve(id)
          : path.resolve(
              importer === undefined ? pathDirectoryTemporary : path.dirname(importer),
              id,
            )

        return (
          outputCatalog.passthroughExternalPaths.has(pathResolved) ||
          (path.isAbsolute(id) && !pathResolved.startsWith(pathDirectoryTemporary))
        )
      },
      onLog: (_, log) => void handlerRollupLog(log),
      onwarn: (log) => void handlerRollupLog(log),
    } satisfies RollupOptions

    await zx.fs.emptyDir(pathDirectoryOutput)

    const resultRollup =
      Object.keys(inputRollup).length === 0
        ? { output: [] }
        : await (await rollup(optionsRollup)).write(optionsRollupOutput)
    const passthroughOutputs = await writePassthroughOutputs({
      passthroughOutputs: outputCatalog.passthroughOutputs,
      pathDirectoryOutput,
      sourcemap: options.sourcemap,
      sourceRoot: options.sourceRoot,
    })
    const filesOutput = [...resultRollup.output, ...passthroughOutputs] as Array<{
      fileName: string
      type: 'asset' | 'chunk'
      isEntry?: boolean
    }>

    if (logLevel === 'info') {
      const filesAll = (
        await Promise.all(
          (await zx.globby('**', { cwd: pathDirectoryOutput })).map(async (file) => ({
            file: path.relative(pathDirectoryPackage, path.resolve(pathDirectoryOutput, file)),
            output: filesOutput.find((value) => value.fileName === file),
            stat: await stat(path.join(pathDirectoryOutput, file)),
          })),
        )
      )
        .filter((value) => value.output !== undefined)
        .sort((a, b) => {
          const scoreA = scoreFile(a.output)
          const scoreB = scoreFile(b.output)

          return scoreA === scoreB
            ? new Intl.Collator('en').compare(a.file, b.file)
            : scoreA - scoreB
        })

      const table = createTable()

      ;[...filesAll].reverse().forEach((value) => {
        table.addRow({
          file:
            value.output?.type === 'chunk'
              ? value.output.isEntry === true
                ? zx.chalk.bold(value.file)
                : zx.chalk.italic(value.file)
              : zx.chalk.gray(value.file),
          size: prettyBytes(value.stat.size, { space: false }),
        })
      })

      console.log(table.render().split(/\r?\n/).slice(2).join('\n'))
    }

    outputFiles.push(
      ...filesOutput.map((value) => ({
        path: path.resolve(pathDirectoryOutput, value.fileName),
      })),
    )
  } finally {
    await zx.fs.remove(pathDirectoryTemporary)
  }
}
