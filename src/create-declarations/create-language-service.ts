/* eslint-disable typescript/unbound-method */
import path from 'node:path'
import type TS from 'typescript'

const DECLARATION_EXTENSION = /\.d\.(?:cts|mts|ts)$/
export const SUPPORTED_ARBITRARY_EXTENSIONS = ['.d.json.ts']
const INITIAL_SCRIPT_VERSION = '0'

export type FindSourceLocationStrategy = 'implementation' | 'type'
interface SourceLocation {
  file: string
  line: number
  lineEnd: number
}

interface IdentifierCandidate {
  position: number
  priority: number
}

export interface LanguageService {
  dispose: () => void
  findSourceLocation: (
    symbolReference: string,
    relativeFilePath: string,
    strategy?: FindSourceLocationStrategy,
  ) => SourceLocation | undefined
  resolve: (filePath: string) => string[] | undefined
}

export type FindSourceLocation = LanguageService['findSourceLocation']

function isDeclarationFile(fileName: string): boolean {
  return DECLARATION_EXTENSION.test(fileName)
}

function isDeclarationNode(ts: typeof TS, node: TS.Node): boolean {
  return (
    ts.isCallSignatureDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isConstructSignatureDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isEnumMember(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isIndexSignatureDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isModuleDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isVariableStatement(node)
  )
}

function findDeclarationNodeAtPosition(
  ts: typeof TS,
  sourceFile: TS.SourceFile,
  position: number,
): TS.Node | undefined {
  const search = (node: TS.Node): TS.Node | undefined => {
    if (position < node.getStart(sourceFile) || position >= node.getEnd()) return

    return ts.forEachChild(node, search) ?? (isDeclarationNode(ts, node) ? node : undefined)
  }

  return search(sourceFile)
}

function scoreDeclarationIdentifier(ts: typeof TS, node: TS.Identifier): number | undefined {
  const parent = node.parent
  if (parent === undefined) return

  if (ts.isEnumMember(parent) || ts.isVariableDeclaration(parent)) {
    if (!ts.isIdentifier(parent.name)) return
    return parent.name === node ? 1 : undefined
  }

  if (
    ts.isClassDeclaration(parent) ||
    ts.isEnumDeclaration(parent) ||
    ts.isFunctionDeclaration(parent) ||
    ts.isInterfaceDeclaration(parent) ||
    ts.isTypeAliasDeclaration(parent)
  ) {
    return parent.name === node ? 0 : undefined
  }

  if (
    ts.isMethodDeclaration(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isPropertySignature(parent)
  ) {
    return parent.name === node ? 1 : undefined
  }

  return
}

function collectDeclarationCandidates(
  ts: typeof TS,
  program: TS.Program,
  fileName: string,
  identifier: string,
): IdentifierCandidate[] {
  const sourceFile = program.getSourceFile(fileName)
  if (sourceFile === undefined) return []

  const seen = new Set<number>()
  const candidates: IdentifierCandidate[] = []

  const record = (node: TS.Node, priority: number): void => {
    const position = node.getStart(sourceFile, false)
    if (seen.has(position)) return
    seen.add(position)
    candidates.push({ position, priority })
  }

  const registerIdentifier = (node: TS.Identifier): void => {
    if (node.text !== identifier) return
    const priority = scoreDeclarationIdentifier(ts, node)
    if (priority === undefined) return
    record(node, priority)
  }

  const registerStringLiteral = (node: TS.StringLiteralLike): void => {
    if (node.text !== identifier) return

    const parent = node.parent
    if (parent === undefined) return

    const supportsStringName =
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isEnumMember(parent)

    if (!supportsStringName) return
    if (parent.name !== node) return

    record(node, 1)
  }

  const registerConstructor = (node: TS.ConstructorDeclaration): void => {
    if (identifier === 'constructor') record(node, 0)
  }

  const visit = (node: TS.Node): void => {
    if (ts.isIdentifier(node)) {
      registerIdentifier(node)
    } else if (ts.isStringLiteralLike(node)) {
      registerStringLiteral(node)
    } else if (ts.isConstructorDeclaration(node)) {
      registerConstructor(node)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  candidates.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority
    }
    return left.position - right.position
  })

  return candidates
}

/**
 * Predict output paths (e.g., .d.ts and .map) for a virtual file,
 * using the original program's file set so path projection matches.
 */
export function createLanguageService(ts: typeof TS, program: TS.Program): LanguageService {
  const compilerOptions = program.getCompilerOptions()

  const currentDirectory = program.getCurrentDirectory()
  const snapshots = new Map<string, TS.IScriptSnapshot>()
  const realFiles: string[] = []

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue

    const resolvedFileName = path.resolve(currentDirectory, sourceFile.fileName)
    realFiles.push(resolvedFileName)
    snapshots.set(resolvedFileName, ts.ScriptSnapshot.fromString(sourceFile.text))
  }

  const resolveInProgram = (filePath: string) => path.resolve(currentDirectory, filePath)

  const host: TS.LanguageServiceHost = {
    directoryExists: ts.sys.directoryExists,
    fileExists: ts.sys.fileExists,
    getDirectories: ts.sys.getDirectories,
    readDirectory: ts.sys.readDirectory,
    readFile: ts.sys.readFile,
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => currentDirectory,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getScriptFileNames: () => [...realFiles, ...snapshots.keys()],
    getScriptSnapshot: (fileName) => snapshots.get(resolveInProgram(fileName)),
    getScriptVersion: () => INITIAL_SCRIPT_VERSION,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  }

  const languageService = ts.createLanguageService(host, ts.createDocumentRegistry())

  const createSourceLocation = (fileName: string, textSpan: TS.TextSpan): SourceLocation => {
    const sourceFile = program.getSourceFile(fileName)!

    const declarationNode = findDeclarationNodeAtPosition(ts, sourceFile, textSpan.start)

    if (declarationNode !== undefined) {
      const startPosition = ts.getLineAndCharacterOfPosition(
        sourceFile,
        declarationNode.getStart(sourceFile),
      )
      const endPosition = ts.getLineAndCharacterOfPosition(sourceFile, declarationNode.getEnd())

      return {
        file: fileName,
        line: startPosition.line + 1,
        lineEnd: endPosition.line + 1,
      }
    }

    const startPosition = ts.getLineAndCharacterOfPosition(sourceFile, textSpan.start)
    const endPosition = ts.getLineAndCharacterOfPosition(
      sourceFile,
      textSpan.start + textSpan.length,
    )

    return {
      file: currentDirectory,
      line: startPosition.line + 1,
      lineEnd: endPosition.line + 1,
    }
  }

  type DocumentSpanLike = Pick<TS.DocumentSpan, 'fileName' | 'textSpan'>

  const convertDefinitionToLocation = (
    definitionInfo?: DocumentSpanLike,
  ): SourceLocation | undefined =>
    definitionInfo !== undefined
      ? createSourceLocation(definitionInfo.fileName, definitionInfo.textSpan)
      : undefined

  function tryDefinitions(
    suppliers: Array<() => readonly DocumentSpanLike[] | undefined>,
  ): SourceLocation | undefined {
    for (const supplier of suppliers) {
      const items = supplier()
      const picked = items?.find((item) => !isDeclarationFile(item.fileName))
      if (picked !== undefined) return convertDefinitionToLocation(picked)
    }
    return
  }

  return {
    dispose: () => {
      languageService.dispose()
    },
    findSourceLocation: (
      symbolReference: string,
      relativeFilePath: string,
      strategy: FindSourceLocationStrategy = 'type',
    ) => {
      const absolutePath = resolveInProgram(relativeFilePath)
      const candidates = collectDeclarationCandidates(ts, program, absolutePath, symbolReference)
      if (candidates.length === 0) return

      const getDefinitionSuppliers = (
        position: number,
      ): Array<() => readonly DocumentSpanLike[] | undefined> => {
        const definitionSupplier = () =>
          languageService.getDefinitionAtPosition(absolutePath, position) ??
          languageService.getDefinitionAndBoundSpan(absolutePath, position)?.definitions

        const typeDefinitionSupplier = () =>
          languageService.getTypeDefinitionAtPosition(absolutePath, position)

        const implementationSupplier = () =>
          languageService.getImplementationAtPosition(absolutePath, position)

        return strategy === 'type'
          ? [definitionSupplier, typeDefinitionSupplier, implementationSupplier]
          : [definitionSupplier, implementationSupplier, typeDefinitionSupplier]
      }

      const resolveAtPosition = (position: number): SourceLocation | undefined =>
        tryDefinitions(getDefinitionSuppliers(position))

      for (const candidate of candidates) {
        const location = resolveAtPosition(candidate.position)
        if (location !== undefined) return location
      }

      return
    },
    resolve: (filePath: string) => {
      const extension = SUPPORTED_ARBITRARY_EXTENSIONS.find((arbitraryExtension) =>
        filePath.endsWith(arbitraryExtension),
      )

      if (extension === undefined) {
        return
      }

      const normalizedFilePath = `${filePath.substring(0, filePath.length - extension.length)}.ts`

      if (!snapshots.has(normalizedFilePath)) {
        snapshots.set(normalizedFilePath, ts.ScriptSnapshot.fromString(''))
      }

      return languageService
        .getEmitOutput(normalizedFilePath, /*emitOnlyDtsFiles*/ true)
        .outputFiles.filter((outputFile) => DECLARATION_EXTENSION.test(outputFile.name))
        .map((outputFile) => outputFile.name.replace(DECLARATION_EXTENSION, extension))
    },
  }
}
