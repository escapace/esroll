import pluginJSON from '@rollup/plugin-json'
import commonPathPrefix from 'common-path-prefix'
import { build as esbuild, type BuildOptions as ESBuildOptions, type SameShape } from 'esbuild'
import { findUp } from 'find-up'
import isPathInside from 'is-path-inside'
import { omit } from 'lodash-es'
import assert from 'node:assert'
import { mkdtemp, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import prettyBytes from 'pretty-bytes'
import { rollup, type LogLevelOption as RollupLogLevel, type RollupOptions } from 'rollup'
import * as zx from 'zx'
import { pluginSourcemaps } from './plugins/plugin-sourcemaps'
import type { BuildOptions, BuildResult, LogLevel, TransformFailure } from './types'
import { createHandlerRollupLog } from './utilities/create-handler-rollup-log'
import { createSourcemapConsumers } from './utilities/create-sourcemap-consumers'
import { createTable } from './utilities/create-table'
import { messagesPrint } from './utilities/messages-print'
import { scoreFile } from './utilities/score-file'
import { transformFailureFlatten } from './utilities/transform-failure-flatten'
import { emitTypeScriptDeclarations } from './utilities/emit-typescript-declarations'

export type { BuildOptions, BuildResult }

const assertionsESBuildOptions = (options: ESBuildOptions) => {
  assert(options.sourcemap !== 'both')
  assert(typeof options.outdir === 'string')
  assert(Array.isArray(options.entryPoints))
  assert(options.entryPoints.length !== 0)
  if (options.logLevel !== undefined) {
    assert(
      (['error', 'info', 'silent'] satisfies LogLevel[])
        // @ts-expect-error careful not to silence the satisfies before
        .includes(options.logLevel),
    )
  }
  if (options.absWorkingDir !== undefined) {
    assert(path.isAbsolute(options.absWorkingDir))
  }
}

export async function build<T extends BuildOptions>(
  options: SameShape<BuildOptions, T>,
): Promise<BuildResult> {
  assertionsESBuildOptions(options)

  const pathFilePackageJSON = await findUp('package.json', { cwd: options.absWorkingDir })
  const pathDirectoryTemporary = await mkdtemp(path.join(os.tmpdir(), 'esroll'))
  const pathDirectoryPackage =
    options.absWorkingDir ??
    (pathFilePackageJSON === undefined ? undefined : path.dirname(pathFilePackageJSON)) ??
    process.cwd()
  const pathDirectoryOutput = path.resolve(pathDirectoryPackage, options.outdir)
  const pathFileTSConfig =
    options.tsconfig === undefined
      ? undefined
      : path.resolve(pathDirectoryPackage, options.tsconfig)

  assert(isPathInside(pathDirectoryOutput, pathDirectoryPackage))
  assert(
    options.declarationRollup === true ||
      options.declarationRollup === false ||
      options.declarationRollup === undefined,
  )

  if (options.declarationRollup === true) {
    assert(options.entryPoints.length === 1, 'Declaration rollup requires a single entry point.')
    assert(pathFileTSConfig !== undefined)
    assert(pathFilePackageJSON !== undefined)
  }

  process.chdir(pathDirectoryPackage)

  const logLevel = options.logLevel ?? 'info'
  const hasColor = ![0, undefined].includes(zx.chalk.level)

  const optionsESBuild = {
    preserveSymlinks: false,
    ...(omit(options, [
      'rollup',
      'declarationRollup',
      'declarationRollupPackages',
    ]) as ESBuildOptions),
    absWorkingDir: pathDirectoryPackage,
    allowOverwrite: true,
    bundle: true,
    color: hasColor,
    format: 'esm',
    globalName: undefined,
    // loader: {
    //   '.json': 'copy',
    //   ...options.loader,
    // },
    logLevel: 'silent',
    metafile: true,
    minify: false,
    outdir: pathDirectoryTemporary,
    outExtension: { '.js': '.js', ...options.outExtension },
    outfile: undefined,
    sourcemap: 'external',
    sourceRoot: undefined,
    stdin: undefined,
    write: true,
  } satisfies ESBuildOptions

  const messages: TransformFailure = {
    errors: [],
    warnings: [],
  }

  try {
    const resultESBuild = await esbuild(optionsESBuild)

    assert(resultESBuild.metafile?.outputs !== undefined)

    messages.errors.push(...resultESBuild.errors)
    messages.warnings.push(...resultESBuild.warnings)

    const sourceMapConsumers = await createSourcemapConsumers(resultESBuild.metafile)
    const handlerRollupLog = createHandlerRollupLog({
      messages,
      pathDirectoryPackage,
      pathDirectoryTemporary,
      sourceMapConsumers,
    })

    const optionsRollup = {
      experimentalLogSideEffects: options.rollup?.experimentalLogSideEffects,
      external: (id) =>
        !id.startsWith('./') && !id.startsWith(pathDirectoryTemporary) && !id.startsWith('../'),
      input: Object.fromEntries(
        Object.entries(resultESBuild.metafile.outputs)
          .filter(
            ([key, value]) =>
              !key.endsWith('.map') &&
              typeof value.entryPoint === 'string' &&
              options.entryPoints
                .map((value) => path.resolve(pathDirectoryPackage, value))
                .includes(path.resolve(pathDirectoryPackage, value.entryPoint)),
          )
          .map(
            ([key]) =>
              [
                path.relative(pathDirectoryTemporary, path.resolve(key)),
                path.resolve(key),
              ] as const,
          ),
      ),
      logLevel: (
        {
          error: 'warn',
          info: 'debug',
          silent: 'silent',
        } satisfies Record<LogLevel, RollupLogLevel>
      )[logLevel],
      maxParallelFileOps: options.rollup?.maxParallelFileOps,
      onLog: (_, log) => void handlerRollupLog(log),
      onwarn: (log) => void handlerRollupLog(log),
      output: {
        chunkFileNames: `[name]-[hash]${optionsESBuild.outExtension['.js']}`,
        dir: options.outdir,
        entryFileNames: (value) =>
          value.isEntry ? value.name : `${value.name}${optionsESBuild.outExtension['.js']}`,
        exports: options.rollup?.output?.exports ?? 'auto',
        externalImportAttributes: options.rollup?.output?.externalImportAttributes,
        externalLiveBindings: false,
        format: 'esm',
        freeze: false,
        generatedCode: {
          constBindings: options.supported?.['const-and-let'] === true,
          objectShorthand: true,
          preset: 'es2015',
          ...options.rollup?.output?.generatedCode,
        },
        importAttributesKey: options.rollup?.output?.importAttributesKey,
        indent: false,
        inlineDynamicImports: false,
        interop: 'esModule',
        minifyInternalExports: options.rollup?.output?.minifyInternalExports ?? false,
        preserveModules: true,
        preserveModulesRoot:
          options.outbase ??
          (options.entryPoints.length === 1
            ? path.dirname(options.entryPoints[0])
            : commonPathPrefix(options.entryPoints)),
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
        sourcemapExcludeSources: !(optionsESBuild.sourcesContent === true),
        // sourcemapIgnoreList: options.rollup?.output?.sourcemapIgnoreList,
        // sourcemapIgnoreList: (value) => value.includes('node_modules'),
        // sourcemapPathTransform: options.rollup?.output?.sourcemapPathTransform,
        validate: true,
      },
      plugins: [
        ...(options.rollup?.plugins ?? []),
        pluginJSON({ indent: '  ', namedExports: true, preferConst: true }),
        pluginSourcemaps(sourceMapConsumers),
      ].filter((value) => value !== undefined),
      preserveEntrySignatures: 'exports-only',
      preserveSymlinks: false,
      treeshake: {
        correctVarValueBeforeDeclaration: false,
        manualPureFunctions: options.pure,
        moduleSideEffects: true,
        preset: 'recommended',
        tryCatchDeoptimization: false,
        unknownGlobalSideEffects: false,
        ...options.rollup?.treeshake,
      },
    } satisfies RollupOptions

    await zx.fs.emptyDir(pathDirectoryOutput)
    const resultRollup = await (await rollup(optionsRollup)).write(optionsRollup.output)

    if (logLevel === 'info') {
      const filesAll = (
        await Promise.all(
          (await zx.globby('**', { cwd: pathDirectoryOutput })).map(async (file) => ({
            file: path.relative(pathDirectoryPackage, path.resolve(pathDirectoryOutput, file)),
            rollup: resultRollup.output.find((value) => value.fileName === file),
            stat: await stat(path.join(pathDirectoryOutput, file)),
          })),
        )
      )
        .filter((value) => value.rollup !== undefined)
        .sort((a, b) => {
          const scoreA = scoreFile(a.rollup)
          const scoreB = scoreFile(b.rollup)

          return scoreA === scoreB
            ? new Intl.Collator('en').compare(a.file, b.file)
            : scoreA - scoreB
        })

      const table = createTable()

      ;[...filesAll].reverse().forEach((value) => {
        table.addRow({
          file:
            value.rollup?.type === 'chunk'
              ? value.rollup.isEntry
                ? zx.chalk.bold(value.file)
                : zx.chalk.italic(value.file)
              : zx.chalk.gray(value.file),
          size: prettyBytes(value.stat.size, { space: false }),
        })
      })

      console.log(table.render().split(/\r?\n/).slice(2).join('\n'))
    }

    await emitTypeScriptDeclarations({
      declarationRollup: options.declarationRollup,
      declarationRollupPackages: options.declarationRollupPackages,
      entryPoints: options.entryPoints.map((value) => path.resolve(pathDirectoryPackage, value)),
      messages,
      pathDirectoryPackage,
      pathFilePackageJSON,
      pathFileTSConfig,
    })

    const outputFiles = resultRollup.output.map((value) => ({
      path: path.resolve(pathDirectoryOutput, value.fileName),
    }))
    await messagesPrint(logLevel, messages, hasColor)

    return {
      errors: messages.errors,
      outputFiles,
      warnings: messages.warnings,
    }
  } catch (error) {
    await messagesPrint(logLevel, transformFailureFlatten(messages, error), hasColor)
    await zx.fs.remove(pathDirectoryTemporary)

    throw error
  } finally {
    await zx.fs.remove(pathDirectoryTemporary)
  }
}
