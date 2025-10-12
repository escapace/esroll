import path from 'node:path'
import { readFileSync } from 'node:fs'
import { ExtractorLogLevel, type ExtractorMessage } from '@microsoft/api-extractor'

import type { BuildMessages } from '../types'

export const apiExtractorDiagnosticMessage = (
  message: ExtractorMessage,
  options: {
    messages: BuildMessages
    pathDirectoryPackage: string
  },
) => {
  const { messages, pathDirectoryPackage } = options

  const destination =
    message.logLevel === ExtractorLogLevel.Error
      ? messages.errors
      : message.logLevel === ExtractorLogLevel.Warning
        ? messages.warnings
        : undefined

  if (destination === undefined) {
    return
  }

  if (message.sourceFilePath === undefined || message.sourceFileLine === undefined) {
    destination.push({
      pluginName: 'api-extractor',
      text: message.text,
    })
    return
  }

  destination.push({
    location: {
      column: message.sourceFileColumn,
      file: path.relative(pathDirectoryPackage, message.sourceFilePath),
      line: message.sourceFileLine,
      lineText: readFileSync(message.sourceFilePath, 'utf8').split(/\r?\n/)[
        message.sourceFileLine - 1
      ],
    },
    pluginName: 'api-extractor',
    text: message.text,
  })
}
