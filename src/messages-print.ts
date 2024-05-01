import { formatMessages as esbuildFormatMessages } from 'esbuild'
import * as zx from 'zx'
import type { LogLevel, TransformFailure } from './types'

function trimArrayWhitespace(array: string[]): string[] {
  // Remove excess whitespace and newline strings from the beginning
  while (array.length > 0 && /^\s*$/.test(array[0])) {
    array.shift()
  }

  // Remove excess whitespace and newline strings from the end
  while (array.length > 0 && /^\s*$/.test(array[array.length - 1])) {
    array.pop()
  }

  return array
}

export const messagesPrint = async (level: LogLevel, value: TransformFailure) => {
  const { errors, warnings } = value

  const color = zx.chalk.level !== 0

  const messages = [
    ...(level === 'info'
      ? await esbuildFormatMessages(warnings ?? [], {
          color,
          kind: 'warning',
          terminalWidth: 100,
        })
      : []),
    ...(level !== 'silent'
      ? await esbuildFormatMessages(errors ?? [], { color, kind: 'error', terminalWidth: 100 })
      : []),
  ].filter((value) => !(value === undefined || value.length === 0))

  if (messages.length !== 0) {
    console.log(trimArrayWhitespace(messages.join('\n').split('\n')).join('\n'))
  }

  return messages
}
