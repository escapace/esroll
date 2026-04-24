import pluginUtils, { type FilterPattern } from '@rollup/pluginutils'
import { readFile } from 'node:fs/promises'
import type { Plugin } from 'rollup'
import type { BuildSourceMapConsumers } from '../types'

interface Options {
  exclude?: FilterPattern
  include?: FilterPattern
}

export function pluginSourcemaps(
  sourceMapConsumers: BuildSourceMapConsumers,
  options?: Options,
): Plugin {
  const { createFilter } = pluginUtils

  const filter = createFilter(options?.include, options?.exclude)

  return {
    async load(id: string) {
      if (!filter(id)) {
        return null
      }

      const code = await readFile(id, 'utf-8')

      return {
        code,
        map: sourceMapConsumers[id]?.map,
      }
    },

    name: 'sourcemaps',
  }
}
