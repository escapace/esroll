/* eslint-disable typescript/unbound-method */
import {
  Extractor,
  ExtractorConfig,
  ExtractorLogLevel,
  type IConfigFile,
} from '@microsoft/api-extractor'
import { findUp } from 'find-up'
import isPathInside from 'is-path-inside'
import { resolve as resolveModule } from 'mlly'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type TS from 'typescript'
import * as zx from 'zx'
import type { TransformFailure } from '../types'

export const emitTypeScriptDeclarations = async (options: {
  entryPoints: string[]
  messages: TransformFailure
  pathDirectoryPackage: string
  declarationRollup?: boolean
  declarationRollupPackages?: string[]
  pathFilePackageJSON?: string
  pathFileTSConfig?: string
}) => {
  const { entryPoints, messages, pathDirectoryPackage, pathFilePackageJSON, pathFileTSConfig } =
    options

  if (pathFileTSConfig === undefined) {
    return
  }

  assert(isPathInside(pathFileTSConfig, pathDirectoryPackage))

  const pathFileTypeScript = await resolveModule('typescript')
  const pathFileTypescriptPackageJSON = await findUp('package.json', {
    cwd: path.dirname(fileURLToPath(pathFileTypeScript)),
  })
  assert(pathFileTypescriptPackageJSON !== undefined, 'Unable to resovle typescript')
  const pathDirectoryTypescript = path.dirname(pathFileTypescriptPackageJSON)
  const ts = (await import(pathFileTypeScript)) as typeof TS

  const parsedCommandLine = ts.parseJsonSourceFileConfigFileContent(
    ts.readJsonConfigFile(pathFileTSConfig, ts.sys.readFile),
    ts.sys,
    pathDirectoryPackage,
  )

  const compilerOptions = parsedCommandLine.options

  assert(compilerOptions.declaration === true)

  let { declarationDir: pathDirectoryDeclaration } = compilerOptions

  assert(typeof pathDirectoryDeclaration === 'string')

  pathDirectoryDeclaration = path.resolve(pathDirectoryPackage, pathDirectoryDeclaration)

  assert(isPathInside(pathDirectoryDeclaration, pathDirectoryPackage))

  const program = ts.createProgram({
    options: {
      ...compilerOptions,
      emitDeclarationOnly: true,
    },
    rootNames: parsedCommandLine.fileNames,
  })

  const sourceFileToDeclarationsMap = new Map<string, Set<string>>()
  const declarationExtension = /\.d\.(?:cts|mts|ts)$/
  const emittedFiles = new Set<string>()

  const emitResult = program.emit(
    undefined,
    (fileName, data, writeBOM, _, sourceFiles = []) => {
      emittedFiles.add(fileName)

      if (declarationExtension.test(fileName)) {
        const sources = sourceFiles
          .map((value) => (value.isDeclarationFile ? value.fileName : undefined))
          .filter((value) => value !== undefined)

        if (sources !== undefined) {
          for (const source of sources) {
            let declarations: Set<string>
            if (sourceFileToDeclarationsMap.has(source)) {
              declarations = sourceFileToDeclarationsMap.get(source)!
            } else {
              declarations = new Set<string>()
              sourceFileToDeclarationsMap.set(source, declarations)
            }

            declarations.add(fileName)
          }
        }
      }

      ts.sys.writeFile(fileName, data, writeBOM)
    },
    undefined,
    true,
  )

  // If you only want declaration files:
  // const dts = outputs.filter((f) => /\.d\.(?:cts|mts|ts)$/.test(f))

  const sourceFileToDeclarationMap = new Map(
    Array.from(sourceFileToDeclarationsMap.entries())
      .map(([sourceFile, declarations]) => {
        for (const declaration of declarations) {
          if (
            path.basename(declaration).replace(declarationExtension, path.extname(sourceFile)) ===
            path.basename(sourceFile)
          ) {
            return [sourceFile, declaration] as const
          }
        }

        return
      })
      .filter((value) => value !== undefined),
  )

  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics)

  if (diagnostics.length !== 0) {
    // console.warn(
    //   ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    //     getCanonicalFileName: (value) => value,
    //     getCurrentDirectory: () => pathDirectoryPackage,
    //     getNewLine: () => ts.sys.newLine,
    //   }),
    // )

    for (const diagnostic of diagnostics) {
      const destination =
        diagnostic.category === ts.DiagnosticCategory.Error
          ? messages.errors
          : diagnostic.category === ts.DiagnosticCategory.Warning
            ? messages.warnings
            : undefined

      if (destination === undefined) {
        continue
      }

      const errorMessage = `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ts.sys.newLine, 0)}`

      if (diagnostic.file !== undefined) {
        const { character, line } = ts.getLineAndCharacterOfPosition(
          diagnostic.file,
          diagnostic.start!,
        )
        const fileName = diagnostic.file.fileName
        const relativeFileName = path.relative(pathDirectoryPackage, fileName)

        destination.push({
          location: {
            column: character,
            file: relativeFileName,
            length: diagnostic.length,
            line,

            lineText: readFileSync(fileName, 'utf8').split(/\r?\n/)[line],
          },
          text: errorMessage,
        })
      } else {
        destination.push({
          text: errorMessage,
        })
      }
    }
  }

  const errorCount = diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error).length

  const declarationRollup =
    options.declarationRollup !== false &&
    entryPoints.length === 1 &&
    sourceFileToDeclarationMap.has(entryPoints[0]) &&
    pathFilePackageJSON !== undefined

  assert(
    errorCount === 0 && !emitResult.emitSkipped,
    (errorCount > 0
      ? emitResult.emitSkipped
        ? 'There are TypeScript errors and no files were written.'
        : 'There are TypeScript errors, but files were still written.'
      : emitResult.emitSkipped
        ? 'No TypeScript errors reported, but nothing was written.'
        : '') + (declarationRollup ? ' Declaration rollup skipped.' : ''),
  )

  if (!declarationRollup) {
    return
  }

  const mainEntryPointFilePath = sourceFileToDeclarationMap.get(entryPoints[0])!

  try {
    const extractorConfig = ExtractorConfig.prepare({
      configObject: {
        apiReport: {
          enabled: false,
          reportFileName: '',
        },
        bundledPackages: options.declarationRollupPackages,
        compiler: {
          tsconfigFilePath: pathFileTSConfig,
        },
        docModel: {
          enabled: false,
        },
        dtsRollup: {
          enabled: true,
          publicTrimmedFilePath: mainEntryPointFilePath,
        },
        enumMemberOrder: 'preserve' as Exclude<IConfigFile['enumMemberOrder'], undefined>,
        mainEntryPointFilePath,
        messages: {
          compilerMessageReporting: {
            default: {
              logLevel: ExtractorLogLevel.Warning,
            },
          },
          extractorMessageReporting: {
            default: {
              logLevel: ExtractorLogLevel.Warning,
            },
          },
        },
        newlineKind: ts.sys.newLine === '\r\n' ? 'crlf' : ts.sys.newLine === '\n' ? 'lf' : 'os',
        projectFolder: pathDirectoryPackage,
        tsdocMetadata: {
          enabled: false,
        },
      },
      configObjectFullPath: path.join(pathDirectoryPackage, 'virtual-api-extractor.json'),
      packageJsonFullPath: pathFilePackageJSON,
    })

    Extractor.invoke(extractorConfig, {
      localBuild: false,
      messageCallback: (message) => {
        message.handled = true

        const destination =
          message.logLevel === ExtractorLogLevel.Error
            ? messages.errors
            : message.logLevel === ExtractorLogLevel.Warning
              ? messages.warnings
              : undefined

        if (
          destination === undefined ||
          message.sourceFilePath === undefined ||
          message.sourceFileLine === undefined
        ) {
          destination?.push({
            pluginName: 'api-extractor',
            text: message.text,
          })
        } else {
          destination.push({
            location: {
              column: message.sourceFileColumn,
              file:
                message.sourceFilePath === undefined
                  ? undefined
                  : path.relative(pathDirectoryPackage, message.sourceFilePath),
              line: message.sourceFileLine,
              lineText: readFileSync(message.sourceFilePath, 'utf8').split(/\r?\n/)[
                message.sourceFileLine - 1
              ],
            },
            pluginName: 'api-extractor',
            text: message.text,
          })
        }
      },
      showDiagnostics: false,
      showVerboseMessages: false,
      typescriptCompilerFolder: pathDirectoryTypescript,
    })

    const bundle = await readFile(mainEntryPointFilePath, 'utf-8')
    await zx.fs.emptyDir(pathDirectoryDeclaration)
    await zx.fs.mkdirp(path.dirname(mainEntryPointFilePath))
    await writeFile(mainEntryPointFilePath, bundle)
  } catch (error) {
    await zx.fs.emptyDir(pathDirectoryDeclaration)
    throw error
  }
}
