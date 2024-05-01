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
import { createHandlerRollupLog } from './create-handler-rollup-log'
import { createSourcemapConsumers } from './create-sourcemap-consumers'
import { createTable } from './create-table'
import { messagesPrint } from './messages-print'
import { pluginSourcemaps } from './plugin-sourcemaps'
import { scoreFile } from './score-file'
import { transformFailureFlatten } from './transform-failure-flatten'
import type { BuildOptions, BuildResult, LogLevel, TransformFailure } from './types'

export type { BuildOptions, BuildResult }

const assertions = (options: ESBuildOptions) => {
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

// TODO: return build result & metafile
export async function build<T extends BuildOptions>(
  options: SameShape<BuildOptions, T>,
): Promise<BuildResult> {
  assertions(options)

  const pathFilePackageJSON = await findUp('package.json')
  assert(pathFilePackageJSON !== undefined)

  const pathDirectoryTemporary = await mkdtemp(path.join(os.tmpdir(), 'esroll'))
  const pathDirectoryPackage = options.absWorkingDir ?? path.dirname(pathFilePackageJSON)
  const pathDirectoryOutput = path.resolve(pathDirectoryPackage, options.outdir)

  assert(isPathInside(pathDirectoryOutput, pathDirectoryPackage))
  process.chdir(pathDirectoryPackage)

  const logLevel = options.logLevel ?? 'info'

  const optionsESBuild = {
    ...(omit(options, ['rollup']) as ESBuildOptions),
    absWorkingDir: pathDirectoryPackage,
    allowOverwrite: true,
    bundle: true,
    color: zx.chalk.level !== 0,
    format: 'esm',
    globalName: undefined,
    logLevel: 'silent',
    metafile: true,
    minify: false,
    outdir: pathDirectoryTemporary,
    outExtension: { '.js': '.js', ...options.outExtension },
    outfile: undefined,
    preserveSymlinks: false,
    sourcemap: 'external',
    sourceRoot: undefined,
    stdin: undefined,
    write: true,
  } satisfies ESBuildOptions

  try {
    const resultESBuild = await esbuild(optionsESBuild)

    assert(resultESBuild.metafile?.outputs !== undefined)

    const messages: TransformFailure = {
      errors: [...resultESBuild.errors],
      warnings: [...resultESBuild.warnings],
    }

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
        !(id.startsWith('./') || id.startsWith(pathDirectoryTemporary) || id.startsWith('../')),
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
      plugins: [pluginSourcemaps(sourceMapConsumers)],
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

    await messagesPrint(logLevel, messages)

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

    return {
      errors: messages.errors ?? [],
      outputFiles: resultRollup.output.map((value) => ({
        path: path.resolve(pathDirectoryPackage, value.fileName),
      })),
      warnings: messages.warnings ?? [],
    }
  } catch (error) {
    await messagesPrint(logLevel, transformFailureFlatten(error))

    throw error
  } finally {
    await zx.fs.remove(pathDirectoryTemporary)
  }
}
