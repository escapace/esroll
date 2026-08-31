import { init, parse } from 'es-module-lexer'
import MagicString from 'magic-string'
import path from 'node:path'
import type { Plugin, RenderedChunk } from 'rollup'

const isQuotedLiteral = (code: string, index: number) => ["'", '"', '`'].includes(code[index] ?? '')

const resolveImportedFileName = (chunk: Pick<RenderedChunk, 'fileName'>, specifier: string) =>
  specifier.startsWith('./') || specifier.startsWith('../')
    ? path.posix.normalize(path.posix.join(path.posix.dirname(chunk.fileName), specifier))
    : undefined

export const pluginPublicPathChunkImports = (publicPath: string | undefined): Plugin => ({
  name: 'public-path-chunk-imports',
  async renderChunk(code, chunk) {
    if (publicPath === undefined) {
      return null
    }

    await init

    const base = publicPath.replace(/\/+$/, '')
    const importedInternalFileNames = new Set([...chunk.dynamicImports, ...chunk.imports])
    const magicString = new MagicString(code)
    let hasChanges = false

    for (const record of parse(code)[0]) {
      if (typeof record.n !== 'string') {
        continue
      }

      const fileName = resolveImportedFileName(chunk, record.n)

      if (fileName === undefined || !importedInternalFileNames.has(fileName)) {
        continue
      }

      const publicUrl = `${base}/${fileName}`
      const replacement = isQuotedLiteral(code, record.s)
        ? JSON.stringify(publicUrl)
        : JSON.stringify(publicUrl).slice(1, -1)

      magicString.overwrite(record.s, record.e, replacement)
      hasChanges = true
    }

    if (!hasChanges) {
      return null
    }

    return {
      code: magicString.toString(),
      map: magicString.generateMap({ hires: true }).toString(),
    }
  },
})
