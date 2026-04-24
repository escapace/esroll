import type { Plugin } from 'rollup'

export const pluginPublicPathImports = (imports: ReadonlyMap<string, string>): Plugin => ({
  name: 'public-path-imports',
  resolveId(source) {
    return imports.get(source) ?? null
  },
})
