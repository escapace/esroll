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
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type TS from 'typescript'
import * as zx from 'zx'
import { createDocumentation } from '../create-documentation'
import { fromMarkdown, toMarkdown } from '../create-documentation/markdown'
import { replaceHeadingSection } from '../create-documentation/replace-heading-section'
import type { CommonOptions } from '../types'
import { isFile } from '../utilities/is-file'
import { apiExtractorDiagnosticMessage } from './api-extractor-diagnostic-message'
import {
  createLanguageService,
  SUPPORTED_ARBITRARY_EXTENSIONS,
  type LanguageService,
} from './create-language-service'
import { typeScriptDiagnosticMessage } from './typescript-diagnostic-message'
import { isPathImmediatelyInside } from '../utilities/is-path-immediately-inside'

const declarationExtension = /\.d\.(?:cts|mts|ts)$/

// export interface CommonOptions extends DeclarationOptions {
//   includeForgottenExports?: boolean
// }

interface ProgramOptions extends CommonOptions {
  compilerOptions: TS.CompilerOptions
  declarationRollup: boolean
  parsedCommandLine: TS.ParsedCommandLine
  pathDirectoryDeclaration: string
  pathDirectoryTemporary: string
  pathDirectoryTypescript: string
  pathFileAPIJSON: string
  pathFileTSConfig: string
  program: TS.Program
  service: LanguageService
  ts: typeof TS
}

interface DeclarationWriteOptions extends ProgramOptions {
  emitResult: TS.EmitResult
  errorCount: number
  sourceFileToDeclarationMap: Map<string, string>
}

interface ApiExtractorOptions extends DeclarationWriteOptions {
  apiExtractorEnabled: boolean
  pathFileEntryPoint?: string
}

const createEnvironmentOptions = async (
  options: CommonOptions,
): Promise<ProgramOptions | undefined> => {
  const { declarationRollup, documentation, pathDirectoryPackage, pathFileTSConfig } = options

  if (pathFileTSConfig === undefined) {
    return undefined
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

  let { declarationDir: pathDirectoryDeclaration } = compilerOptions

  assert(
    typeof pathDirectoryDeclaration === 'string',
    'declarationDir must be set in tsconfig compilerOptions',
  )

  pathDirectoryDeclaration = path.resolve(pathDirectoryPackage, pathDirectoryDeclaration)

  assert(isPathInside(pathDirectoryDeclaration, pathDirectoryPackage))

  const program = ts.createProgram({
    options: {
      ...compilerOptions,
      declaration: true,
      emitDeclarationOnly: true,
    },
    rootNames: parsedCommandLine.fileNames,
  })

  const pathDirectoryTemporary = await mkdtemp(path.join(os.tmpdir(), 'esroll'))
  const pathFileAPIJSON = path.join(pathDirectoryTemporary, 'documentation.api.json')
  const entryPoints = options.entryPoints?.map((value) => path.resolve(pathDirectoryPackage, value))

  return {
    ...options,
    compilerOptions,
    declarationRollup: declarationRollup === true,
    documentation,
    entryPoints,
    parsedCommandLine,
    pathDirectoryDeclaration,
    pathDirectoryTemporary,
    pathDirectoryTypescript,
    pathFileAPIJSON,
    pathFileTSConfig,
    program,
    service: createLanguageService(ts, program),
    ts,
  }
}

const writeDeclarations = (programOptions: ProgramOptions): DeclarationWriteOptions => {
  const { pathDirectoryPackage, program, result, ts } = programOptions
  const sourceFileToDeclarationsMap = new Map<string, Set<string>>()

  const emitResult = program.emit(
    undefined,
    (fileName, data, writeBOM, _, sourceFiles = []) => {
      if (declarationExtension.test(fileName)) {
        const sources = sourceFiles
          .map((value) => (value.isDeclarationFile ? value.fileName : undefined))
          .filter((value): value is string => value !== undefined)

        for (const source of sources) {
          let declarations = sourceFileToDeclarationsMap.get(source)

          if (declarations === undefined) {
            declarations = new Set<string>()
            sourceFileToDeclarationsMap.set(source, declarations)
          }

          declarations.add(fileName)
        }
      }

      ts.sys.writeFile(fileName, data, writeBOM)
    },
    undefined,
    true,
  )

  const sourceFileToDeclarationMap = new Map<string, string>()

  for (const [sourceFile, declarations] of sourceFileToDeclarationsMap.entries()) {
    for (const declaration of declarations) {
      if (
        path.basename(declaration).replace(declarationExtension, path.extname(sourceFile)) ===
        path.basename(sourceFile)
      ) {
        sourceFileToDeclarationMap.set(sourceFile, declaration)
        break
      }
    }
  }

  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics)

  for (const diagnostic of diagnostics) {
    typeScriptDiagnosticMessage(diagnostic, {
      messages: result,
      pathDirectoryPackage,
      ts,
    })
  }

  const errorCount = diagnostics.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  ).length

  const writeOptions: DeclarationWriteOptions = {
    ...programOptions,
    emitResult,
    errorCount,
    sourceFileToDeclarationMap,
  }

  writeArbitraryExtensionsDeclarations(writeOptions)

  return writeOptions
}

const writeArbitraryExtensionsDeclarations = (options: DeclarationWriteOptions): void => {
  const { compilerOptions, program, service } = options

  if (compilerOptions.allowArbitraryExtensions !== true) {
    return
  }

  const rootFileNames = program.getRootFileNames()
  const sourceFiles = program
    .getSourceFiles()
    .filter(
      (value) =>
        value.isDeclarationFile &&
        value.fileName.endsWith('.d.json.ts') &&
        rootFileNames.includes(value.fileName),
    )

  for (const sourceFile of sourceFiles) {
    const files = service.resolve(sourceFile.fileName)

    if (files?.length !== 1) {
      break
    }

    const filePath = files[0]
    zx.fs.ensureDirSync(path.dirname(filePath))
    zx.fs.copySync(sourceFile.fileName, filePath)
  }
}

const createApiExtractorOptions = (writeOptions: DeclarationWriteOptions): ApiExtractorOptions => {
  const {
    declarationRollup,
    documentation,
    emitResult,
    entryPoints,
    errorCount,
    sourceFileToDeclarationMap,
  } = writeOptions

  const enabled = declarationRollup || documentation === true || typeof documentation === 'string'

  assert(
    errorCount === 0 && !emitResult.emitSkipped,
    errorCount > 0
      ? emitResult.emitSkipped
        ? 'There are TypeScript errors and no files were written.'
        : 'There are TypeScript errors, but files were still written.'
      : emitResult.emitSkipped
        ? 'No TypeScript errors reported, but nothing was written.'
        : '',
  )

  if (!enabled) {
    return {
      ...writeOptions,
      apiExtractorEnabled: false,
    }
  }

  const pathFileEntryPoint = sourceFileToDeclarationMap.get(entryPoints[0])

  assert(
    pathFileEntryPoint !== undefined,
    'entry point must be found when options.declarationRollup and/or options.documentation is true',
  )

  return {
    ...writeOptions,
    apiExtractorEnabled: true,
    pathFileEntryPoint,
  }
}

const runApiExtractor = async (apiExtractorOptions: ApiExtractorOptions): Promise<void> => {
  if (!apiExtractorOptions.apiExtractorEnabled) {
    return
  }

  const {
    declarationRollup,
    declarationRollupPackages,
    documentation,
    documentationIncludeForgottenExports,
    pathDirectoryDeclaration,
    pathDirectoryPackage,
    pathDirectoryTypescript,
    pathFileAPIJSON,
    pathFileEntryPoint,
    pathFilePackageJSON,
    pathFileTSConfig,
    result,
    ts,
  } = apiExtractorOptions

  assert(pathFileEntryPoint !== undefined, 'Entry point declaration file must be found')
  assert(pathFilePackageJSON !== undefined, 'package.json must be found')

  try {
    const extractorConfig = ExtractorConfig.prepare({
      configObject: {
        apiReport: {
          enabled: false,
          reportFileName: '',
        },
        bundledPackages: declarationRollupPackages,
        compiler: {
          tsconfigFilePath: pathFileTSConfig,
        },
        docModel: {
          apiJsonFilePath: pathFileAPIJSON,
          enabled: typeof documentation === 'string' || documentation === true,
          includeForgottenExports: documentationIncludeForgottenExports === true,
        },
        dtsRollup: {
          enabled: declarationRollup,
          omitTrimmingComments: true,
          publicTrimmedFilePath: pathFileEntryPoint,
        },
        enumMemberOrder: 'preserve' as Exclude<IConfigFile['enumMemberOrder'], undefined>,
        mainEntryPointFilePath: pathFileEntryPoint,
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
          tsdocMessageReporting: {
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

        if (
          message.messageId === 'ae-wrong-input-file-type' &&
          SUPPORTED_ARBITRARY_EXTENSIONS.some(
            (value) => message.sourceFilePath?.endsWith(value) === true,
          )
        ) {
          return
        }

        if (
          // documentationIncludeForgottenExports === true &&
          message.messageId === 'ae-missing-release-tag'
        ) {
          return
        }

        apiExtractorDiagnosticMessage(message, {
          messages: result,
          pathDirectoryPackage,
        })
      },
      showDiagnostics: false,
      showVerboseMessages: false,
      typescriptCompilerFolder: pathDirectoryTypescript,
    })

    if (declarationRollup) {
      const bundle = await readFile(pathFileEntryPoint, 'utf-8')
      await zx.fs.emptyDir(pathDirectoryDeclaration)
      await zx.fs.mkdirp(path.dirname(pathFileEntryPoint))
      await writeFile(pathFileEntryPoint, bundle)
    }
  } catch (unknownError: unknown) {
    await zx.fs.emptyDir(pathDirectoryDeclaration)
    throw unknownError
  }
}

const handleDocumentation = async (options: ProgramOptions) => {
  const {
    documentation,
    documentationHeading,
    pathDirectoryPackage,
    pathFileAPIJSON,
    result,
    service,
  } = options

  if (documentation !== true && typeof documentation !== 'string') {
    return
  }

  const pathFileDocumentation = path.resolve(
    pathDirectoryPackage,
    documentation === true ? 'README.md' : documentation,
  )

  assert(
    isPathImmediatelyInside(pathFileDocumentation, pathDirectoryPackage),
    'documentation file must be an immediate child of the package directory',
  )

  const heading = fromMarkdown(documentationHeading ?? '# API')[0]
  assert(heading.type === 'heading', 'documentationHeading must contain a heading node')
  assert(heading.children.length >= 1, 'documentationHeading heading must include text content')

  let root = createDocumentation({
    findSourceLocation: service.findSourceLocation,
    headingDepth: heading.depth + 1,
    modelFilePath: pathFileAPIJSON,
  })

  if (root === undefined) {
    return
  }

  root.children.unshift(heading)

  if (await isFile(pathFileDocumentation)) {
    root = replaceHeadingSection(
      { children: fromMarkdown(await readFile(pathFileDocumentation, 'utf-8')), type: 'root' },
      root,
    )
  }

  await zx.fs.mkdirp(path.dirname(pathFileDocumentation))
  await writeFile(pathFileDocumentation, toMarkdown(...root.children), 'utf-8')

  result.outputFiles.push({ path: pathFileDocumentation })
}

export const createDeclarations = async (options: CommonOptions) => {
  if (options.declaration !== true) {
    return
  }

  const programOptions = await createEnvironmentOptions(options)

  if (programOptions === undefined) {
    return
  }

  process.chdir(programOptions.pathDirectoryPackage)

  try {
    await runApiExtractor(createApiExtractorOptions(writeDeclarations(programOptions)))
    await handleDocumentation(programOptions)

    programOptions.result.outputFiles.push(
      ...(
        await zx.glob('**/*', { absolute: true, cwd: programOptions.pathDirectoryDeclaration })
      ).map((path) => ({ path })),
    )
  } finally {
    programOptions.service.dispose()
    await zx.fs.remove(programOptions.pathDirectoryTemporary)
  }
}
