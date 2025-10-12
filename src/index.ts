import { findUp } from 'find-up'
import assert from 'node:assert'
import path from 'node:path'
import * as zx from 'zx'
import { createBundle } from './create-bundle'
import { createDeclarations } from './create-declarations'
import type { BuildLogLevel, BuildOptions, BuildResult, CommonOptions } from './types'
import { messagesPrint } from './utilities/messages-print'
import { transformFailureFlatten } from './utilities/transform-failure-flatten'

export type { BuildOptions, BuildOptionsExcluded, BuildResult } from './types'

async function createCommonOptions(options: BuildOptions): Promise<CommonOptions> {
  assert(
    typeof options.outdir === 'string' || options.declaration === true,
    'At least one of options.outdir or options.declaration must be set',
  )

  if (options.logLevel !== undefined) {
    assert(
      (['error', 'info', 'silent'] satisfies BuildLogLevel[]).includes(options.logLevel),
      'options.logLevel must be "error", "info", or "silent"',
    )
  }

  if (options.absWorkingDir !== undefined) {
    assert(path.isAbsolute(options.absWorkingDir), 'options.absWorkingDir must be an absolute path')
  }

  const pathFilePackageJSON = await findUp('package.json', { cwd: options.absWorkingDir })
  const pathDirectoryPackage =
    options.absWorkingDir ??
    (pathFilePackageJSON === undefined ? undefined : path.dirname(pathFilePackageJSON)) ??
    process.cwd()
  const pathFileTSConfig =
    options.tsconfig === undefined
      ? undefined
      : path.resolve(pathDirectoryPackage, options.tsconfig)

  if (typeof options.outdir === 'string') {
    assert(
      Array.isArray(options.entryPoints) && options.entryPoints.length !== 0,
      'options.entryPoints must be a non-empty array when options.outdir is set',
    )
    assert(
      ['external', false, 'inline', 'linked', true, undefined].includes(options.sourcemap),
      'options.sourcemap must be false, true, "external", "inline", "linked", or undefined',
    )
  }

  if (options.declaration === true) {
    assert(
      options.declarationRollup === true ||
        options.declarationRollup === false ||
        options.declarationRollup === undefined,
      'options.declarationRollup must be true, false, or undefined',
    )

    if (
      options.declarationRollup === true ||
      options.documentation === true ||
      typeof options.documentation === 'string'
    ) {
      assert(
        Array.isArray(options.entryPoints) && options.entryPoints.length === 1,
        'Declaration rollup and/or documentation requires a single entry point',
      )
      assert(
        pathFileTSConfig !== undefined,
        'options.tsconfig must be set when options.declarationRollup and/or options.documentation is set',
      )
      assert(
        pathFilePackageJSON !== undefined,
        'package.json must be found when options.declarationRollup and/or options.documentation is true',
      )
    }

    assert(
      pathFileTSConfig !== undefined,
      'options.tsconfig must be set when options.declaration is true',
    )
  }

  if (
    options.declarationRollup === true ||
    options.documentation === true ||
    typeof options.documentation === 'string'
  ) {
    assert(
      options.declaration === true,
      'options.declaration must be true when options.declarationRollup or options.documentation is set',
    )
  }

  const logLevel = options.logLevel ?? 'info'
  const hasColor = ![0, undefined].includes(zx.chalk.level)

  const result: BuildResult = {
    errors: [],
    outputFiles: [],
    warnings: [],
  }

  return {
    ...options,
    hasColor,
    logLevel,
    pathDirectoryPackage,
    pathFilePackageJSON,
    pathFileTSConfig,
    result,
  }
}

/**
 * Bundles source files, generates TypeScript declarations, and writes documentation based on the specified options.
 *
 * @param options - Build configuration including entry points, output settings, and compilation flags
 * @returns Build result containing errors, warnings, and paths to the generated output files
 * @throws When the build process encounters fatal errors during bundling or declaration generation
 *
 * @remarks
 *
 * Either {@link BuildOptions.outdir | options.outdir} or {@link BuildOptions.declaration | options.declaration}
 * must be set. When {@link BuildOptions.outdir | options.outdir} is specified, source files are bundled to
 * the output directory.
 *
 * When {@link BuildOptions.declaration | options.declaration} is true, TypeScript declarations are
 * generated and written to the directory specified by the tsconfig compilerOptions.declarationDir
 * setting.
 *
 * Setting {@link BuildOptions.documentation | options.documentation} enables API documentation
 * generation alongside declarations. Setting {@link BuildOptions.declarationRollup | options.declarationRollup}
 * to true bundles the generated declarations.
 *
 * When both {@link BuildOptions.outdir | options.outdir} and {@link BuildOptions.declaration | options.declaration}
 * are set, bundling executes first, declaration generation runs second, and documentation writes last.
 */
export async function build(options: BuildOptions): Promise<BuildResult> {
  const properties = await createCommonOptions(options)
  const { hasColor, logLevel, result } = properties

  try {
    await createBundle(properties)
    await createDeclarations(properties)
  } catch (error) {
    await messagesPrint(logLevel, transformFailureFlatten(result, error), hasColor)

    throw error
  }

  await messagesPrint(logLevel, result, hasColor)
  return result
}
