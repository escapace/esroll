import type { Metafile } from 'esbuild'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { SourceMapConsumer } from 'source-map'
import type { BuildSourceMapConsumers } from '../types'
import { isFile } from '../utilities/is-file'

export const createSourcemapConsumers = async (
  metafile: Metafile,
): Promise<BuildSourceMapConsumers> =>
  Object.fromEntries(
    await Promise.all(
      Object.keys(metafile.outputs)
        .filter((key) => !key.endsWith('.map'))
        .map(async (key) => {
          const pathFileOutput = path.resolve(key)
          const pathFileMap = `${key}.map`

          if (!(await isFile(pathFileMap))) {
            return [pathFileOutput, undefined] as const
          }

          const map = await readFile(pathFileMap, 'utf-8')

          return [
            pathFileOutput,
            {
              consumer: await new SourceMapConsumer(map),
              map,
              pathDirectoryOutput: path.dirname(pathFileOutput),
            },
          ] as const
        }),
    ),
  )
