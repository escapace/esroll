import path from 'node:path'
import { readFileSync } from 'node:fs'
import type TS from 'typescript'

import type { BuildMessages } from '../types'

export const typeScriptDiagnosticMessage = (
  diagnostic: TS.Diagnostic,
  options: {
    messages: BuildMessages
    pathDirectoryPackage: string
    ts: typeof TS
  },
) => {
  const { messages, pathDirectoryPackage, ts } = options

  const destination =
    diagnostic.category === ts.DiagnosticCategory.Error
      ? messages.errors
      : diagnostic.category === ts.DiagnosticCategory.Warning
        ? messages.warnings
        : undefined

  if (destination === undefined) {
    return
  }

  const errorMessage = `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ts.sys.newLine, 0)}`

  if (diagnostic.file === undefined) {
    destination.push({
      text: errorMessage,
    })
    return
  }

  const { character, line } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!)
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
}
