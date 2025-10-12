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
          const map = `${key}.map`
          const consumer = (await isFile(map))
            ? await new SourceMapConsumer(await readFile(map, 'utf-8'))
            : undefined

          return [path.resolve(key), consumer] as const
        }),
    ),
  )
