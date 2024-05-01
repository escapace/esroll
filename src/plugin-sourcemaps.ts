import pluginUtils, { type FilterPattern } from '@rollup/pluginutils'
import { readFile } from 'node:fs/promises'
import type { Plugin } from 'rollup'
import { SourceMapGenerator } from 'source-map'
import type { SourceMapConsumers } from './types'

const { createFilter } = pluginUtils

interface Options {
  exclude?: FilterPattern
  include?: FilterPattern
}

export function pluginSourcemaps(
  sourceMapConsumers: SourceMapConsumers,
  options?: Options,
): Plugin {
  const filter = createFilter(options?.include, options?.include)

  return {
    async load(id: string) {
      if (!filter(id)) {
        return null
      }

      const code = await readFile(id, 'utf-8')

      const sourceMapConsumer = sourceMapConsumers[id]

      const map =
        sourceMapConsumer === undefined
          ? undefined
          : SourceMapGenerator.fromSourceMap(sourceMapConsumer).toString()

      return { code, map }
    },

    name: 'sourcemaps',
  }
}
