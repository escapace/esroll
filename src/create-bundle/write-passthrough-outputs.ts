import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BuildOptions } from '../types'
import type { EsbuildPassthroughOutput } from './create-esbuild-output-catalog'

interface OutputSummary {
  fileName: string
  type: 'asset'
}

const createOutputSummary = (fileName: string): OutputSummary => ({ fileName, type: 'asset' })

const ensureTrailingNewline = (value: string) => (value.endsWith('\n') ? value : `${value}\n`)

const appendCSSSourceMapComment = (css: string, comment: string) =>
  `${ensureTrailingNewline(css)}${comment}\n`

const createInlineCSSSourceMapComment = (map: string) =>
  `/*# sourceMappingURL=data:application/json;base64,${Buffer.from(map).toString('base64')} */`

const rewriteCSSSourceMap = async (options: {
  pathFileCSSFinal: string
  pathFileCSSTemporary: string
  pathFileMapTemporary: string
  sourceRoot: string | undefined
}) => {
  const { pathFileCSSFinal, pathFileCSSTemporary, pathFileMapTemporary, sourceRoot } = options
  const map = JSON.parse(await readFile(pathFileMapTemporary, 'utf8')) as {
    mappings: string
    names: string[]
    sources: string[]
    version: number
    sourceRoot?: string
    sourcesContent?: string[]
  }

  const pathDirectoryCSSTemporary = path.dirname(pathFileCSSTemporary)
  const pathDirectoryCSSFinal = path.dirname(pathFileCSSFinal)

  map.sources = map.sources.map((value) =>
    path
      .relative(pathDirectoryCSSFinal, path.resolve(pathDirectoryCSSTemporary, value))
      .replaceAll('\\', '/'),
  )

  if (sourceRoot === undefined) {
    delete map.sourceRoot
  } else {
    map.sourceRoot = sourceRoot
  }

  return JSON.stringify(map, null, 2)
}

const writeCSSOutput = async (options: {
  output: { kind: 'css' } & EsbuildPassthroughOutput
  pathDirectoryOutput: string
  sourcemap: BuildOptions['sourcemap']
  sourceRoot: string | undefined
}) => {
  const { output, pathDirectoryOutput, sourcemap, sourceRoot } = options
  const pathFileCSSFinal = path.join(pathDirectoryOutput, output.relativePath)
  const pathDirectoryCSSFinal = path.dirname(pathFileCSSFinal)
  const summaries = [createOutputSummary(output.relativePath)]
  let css = await readFile(output.absolutePath, 'utf8')

  await mkdir(pathDirectoryCSSFinal, { recursive: true })

  if (output.mapAbsolutePath === undefined || sourcemap === false || sourcemap === undefined) {
    await writeFile(pathFileCSSFinal, css)
    return summaries
  }

  const map = await rewriteCSSSourceMap({
    pathFileCSSFinal,
    pathFileCSSTemporary: output.absolutePath,
    pathFileMapTemporary: output.mapAbsolutePath,
    sourceRoot,
  })

  if (sourcemap === 'external') {
    await writeFile(pathFileCSSFinal, css)
    await writeFile(`${pathFileCSSFinal}.map`, map)
    summaries.push(createOutputSummary(`${output.relativePath}.map`))
    return summaries
  }

  if (sourcemap === 'inline') {
    css = appendCSSSourceMapComment(css, createInlineCSSSourceMapComment(map))
    await writeFile(pathFileCSSFinal, css)
    return summaries
  }

  css = appendCSSSourceMapComment(
    css,
    `/*# sourceMappingURL=${path.basename(pathFileCSSFinal)}.map */`,
  )

  await writeFile(pathFileCSSFinal, css)
  await writeFile(`${pathFileCSSFinal}.map`, map)
  summaries.push(createOutputSummary(`${output.relativePath}.map`))

  return summaries
}

const writeAssetOutput = async (options: {
  output: { kind: 'asset' } & EsbuildPassthroughOutput
  pathDirectoryOutput: string
}) => {
  const { output, pathDirectoryOutput } = options
  const pathFileFinal = path.join(pathDirectoryOutput, output.relativePath)

  await mkdir(path.dirname(pathFileFinal), { recursive: true })
  await copyFile(output.absolutePath, pathFileFinal)

  return [createOutputSummary(output.relativePath)]
}

export const writePassthroughOutputs = async (options: {
  passthroughOutputs: EsbuildPassthroughOutput[]
  pathDirectoryOutput: string
  sourcemap: BuildOptions['sourcemap']
  sourceRoot: string | undefined
}) =>
  (
    await Promise.all(
      [...options.passthroughOutputs]
        .sort((a, b) => new Intl.Collator('en').compare(a.relativePath, b.relativePath))
        .map(async (output) =>
          output.kind === 'asset'
            ? await writeAssetOutput({ output, pathDirectoryOutput: options.pathDirectoryOutput })
            : await writeCSSOutput({
                output,
                pathDirectoryOutput: options.pathDirectoryOutput,
                sourcemap: options.sourcemap,
                sourceRoot: options.sourceRoot,
              }),
        ),
    )
  ).flat()
