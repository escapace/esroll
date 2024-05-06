import type { PartialMessage } from 'esbuild'
import { capitalize, startCase } from 'lodash-es'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { RollupLog } from 'rollup'
import type { SourceMapConsumers, TransformFailure } from './types'
import { isFile } from './is-file'

export const createHandlerRollupLog =
  (options: {
    messages: TransformFailure
    pathDirectoryPackage: string
    pathDirectoryTemporary: string
    sourceMapConsumers: SourceMapConsumers
  }) =>
  async (log: RollupLog) => {
    const messageShared = {
      detail: undefined,
      pluginName: log.plugin === undefined ? 'rollup' : `rollup: ${log.plugin}`,
      text: log.code === undefined ? '' : capitalize(startCase(log.code)),
    }

    if (!(log.loc?.file !== undefined && options.sourceMapConsumers[log.loc?.file] !== undefined)) {
      options.messages.warnings?.push({
        ...messageShared,
        location: null,
        notes: [{ location: null, text: log.message }],
      })
    } else {
      const consumer = options.sourceMapConsumers[log.loc.file]

      const position = consumer?.originalPositionFor({
        column: log.loc.column,
        line: log.loc.line,
      })

      if (
        typeof position?.line !== 'number' ||
        typeof position?.column !== 'number' ||
        typeof position?.source !== 'string'
      ) {
        return
      }

      const { column, line, source: sourcePath } = position

      const pathAbsolute = path.resolve(options.pathDirectoryTemporary, sourcePath)
      const file = path.relative(options.pathDirectoryPackage, pathAbsolute)
      const source = (await isFile(pathAbsolute)) ? await readFile(pathAbsolute, 'utf8') : undefined
      const lineText = source?.split(/\r?\n/)[position.line - 1]

      const message: PartialMessage = {
        ...messageShared,
        location: {
          column,
          file,
          line,
          lineText:
            typeof lineText === 'string' ? lineText : `The source for this file is not available.`,
        },
        // notes: [{ location: null, text: log.message }],
      }

      options.messages.warnings?.push(message)
    }
  }
