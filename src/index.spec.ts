import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build as buildESBuild } from 'esbuild'
import { SourceMapConsumer } from 'source-map'
import { describe, expect, it } from 'vitest'
import { createHandlerRollupLog } from './create-bundle/create-handler-rollup-log'
import { createSourcemapConsumers } from './create-bundle/create-sourcemap-consumers'
import { build, type BuildOptions } from './index'
import type { BuildMessages } from './types'

const safeWorkingDirectory = path.resolve(import.meta.dirname, '..')

const createTemporaryWorkspace = async (onTestFinished: (cleanup: () => Promise<void>) => void) => {
  const temporaryRoot = path.join(tmpdir(), 'esroll-tests')
  await mkdir(temporaryRoot, { recursive: true })

  const absoluteWorkingDirectory = await mkdtemp(path.join(temporaryRoot, 'esroll-test-'))

  onTestFinished(async () => {
    process.chdir(safeWorkingDirectory)
    await rm(absoluteWorkingDirectory, { force: true, recursive: true })
  })

  return absoluteWorkingDirectory
}

const writeFixtureFile = async (pathFile: string, content: string) => {
  await mkdir(path.dirname(pathFile), { recursive: true })
  await writeFile(pathFile, content)
}

const readDirectoryFiles = async (pathDirectory: string) => {
  const files: string[] = []

  const walk = async (pathCurrent: string) => {
    for (const entry of await readdir(pathCurrent, { withFileTypes: true })) {
      const pathEntry = path.join(pathCurrent, entry.name)

      if (entry.isDirectory()) {
        await walk(pathEntry)
      } else {
        files.push(pathEntry)
      }
    }
  }

  await walk(pathDirectory)

  return Object.fromEntries(
    await Promise.all(
      files
        .sort((a, b) => new Intl.Collator('en').compare(a, b))
        .map(
          async (value) =>
            [path.relative(pathDirectory, value), await readFile(value, 'utf8')] as const,
        ),
    ),
  )
}

const readJavaScriptSourceMap = async (pathFileJavaScript: string) => {
  const code = await readFile(pathFileJavaScript, 'utf8')
  const matchInline =
    /sourceMappingURL=data:application\/json(?:;charset=utf-8)?;base64,([^\n]+)/.exec(code)?.[1]

  if (typeof matchInline === 'string') {
    return Buffer.from(matchInline, 'base64').toString('utf8')
  }

  return await readFile(`${pathFileJavaScript}.map`, 'utf8')
}

const createPackageFixture = async (absoluteWorkingDirectory: string) => {
  await writeFixtureFile(
    path.join(absoluteWorkingDirectory, 'package.json'),
    JSON.stringify(
      {
        name: 'esroll-test-fixture',
        private: true,
        type: 'module',
        version: '1.0.0',
      },
      null,
      2,
    ),
  )

  await symlink(
    path.join(safeWorkingDirectory, 'node_modules'),
    path.join(absoluteWorkingDirectory, 'node_modules'),
    'dir',
  )
}

describe('esroll integration test', () => {
  it('story: bundle TypeScript source files to an output directory', async ({ onTestFinished }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    const sourceFilePath = path.join(absoluteWorkingDirectory, 'sample.ts')
    await writeFile(sourceFilePath, 'export const greet = (() => "Hello, world!");')

    const buildOptions: BuildOptions = {
      absWorkingDir: absoluteWorkingDirectory,
      entryPoints: [sourceFilePath],
      logLevel: 'silent',
      outdir: path.join(absoluteWorkingDirectory, 'output/files/'),
      rollup: {
        experimentalLogSideEffects: true,
      },
      sourcemap: true,
      sourcesContent: false,
      splitting: true,
      supported: {
        'const-and-let': true,
      },
      treeShaking: true,
    }

    const result = await build(buildOptions)

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
    expect(result.outputFiles).toHaveLength(2)
    expect(await readFile(result.outputFiles[0].path, 'utf8')).toMatchSnapshot()
    expect(await readFile(result.outputFiles[1].path, 'utf8')).toMatchSnapshot()
  })

  it('story: bundle multiple entry points and preserve module structure', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/shared.ts'),
      'export const shared = "shared-value"',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/alpha.ts'),
      'import { shared } from "./shared"\nexport const alpha = `alpha:${shared}`',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/beta.ts'),
      'import { shared } from "./shared"\nexport const beta = `beta:${shared}`',
    )

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      entryPoints: ['src/alpha.ts', 'src/beta.ts'],
      logLevel: 'silent',
      outdir: 'dist',
      sourcemap: true,
      splitting: true,
      treeShaking: true,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const paths = result.outputFiles.map((value) => value.path)
    expect(paths.some((value) => value.endsWith('/dist/alpha.js'))).toBe(true)
    expect(paths.some((value) => value.endsWith('/dist/beta.js'))).toBe(true)
    expect(paths.some((value) => value.endsWith('/dist/alpha.js.map'))).toBe(true)
    expect(paths.some((value) => value.endsWith('/dist/beta.js.map'))).toBe(true)
    expect(paths.length).toBeGreaterThanOrEqual(4)
  })

  it('story: keep source maps external without sourceMappingURL comment in JavaScript output', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    const sourceFilePath = path.join(absoluteWorkingDirectory, 'source.ts')
    await writeFile(sourceFilePath, 'export const value = 42')

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      entryPoints: [sourceFilePath],
      logLevel: 'silent',
      outdir: 'dist',
      sourcemap: 'external',
      treeShaking: true,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const outputJavaScriptFile = result.outputFiles.find((value) => value.path.endsWith('.js'))
    const outputSourceMapFile = result.outputFiles.find((value) => value.path.endsWith('.js.map'))

    expect(outputJavaScriptFile).toBeDefined()
    expect(outputSourceMapFile).toBeDefined()

    const content = await readFile(outputJavaScriptFile!.path, 'utf8')
    expect(content).not.toContain('sourceMappingURL=')
  })

  it('story: honor esbuild default loaders for extensionless JavaScript and text files', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/index'),
      'import message from "./message.txt"\nexport default message\n',
    )
    await writeFixtureFile(path.join(absoluteWorkingDirectory, 'src/message.txt'), 'default text\n')

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      entryPoints: ['src/index'],
      logLevel: 'silent',
      outdir: 'dist',
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const files = await readDirectoryFiles(path.join(absoluteWorkingDirectory, 'dist'))

    expect(Object.keys(files)).toEqual(['index.js'])
    expect(files['index.js']).toContain('default text')
  })

  it('story: map final JavaScript source maps back to original entry and chunk sources', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/shared.ts'),
      'export const shared = 41\n',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/index.ts'),
      'import { shared } from "./shared"\nexport const load = async () => (await import("./lazy")).lazy + shared\n',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/lazy.ts'),
      'export const lazy = 1\n',
    )

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      entryPoints: ['src/index.ts'],
      logLevel: 'silent',
      outdir: 'dist',
      publicPath: 'https://cdn.example/v1',
      sourcemap: 'inline',
      splitting: true,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const files = await readDirectoryFiles(path.join(absoluteWorkingDirectory, 'dist'))
    const pathChunk = Object.keys(files).find(
      (value) => value !== 'index.js' && value.endsWith('.js'),
    )

    expect(pathChunk).toBeDefined()

    const entryCode = files['index.js']
    const entryLine =
      entryCode.split(/\r?\n/).findIndex((value) => value.includes('cdn.example')) + 1
    const entryColumn = entryCode.split(/\r?\n/)[entryLine - 1].indexOf('https://cdn.example/v1/')
    const entryMap = await readJavaScriptSourceMap(
      path.join(absoluteWorkingDirectory, 'dist/index.js'),
    )
    const entryConsumer = await new SourceMapConsumer(entryMap)
    const entryPosition = entryConsumer.originalPositionFor({
      column: entryColumn,
      line: entryLine,
    })

    expect(entryPosition.source).toBe('../src/index.ts')

    const chunkCode = files[pathChunk!]
    const chunkLine =
      chunkCode.split(/\r?\n/).findIndex((value) => value.includes('var lazy = 1')) + 1
    const chunkColumn = chunkCode.split(/\r?\n/)[chunkLine - 1].indexOf('lazy')
    const chunkMap = await readJavaScriptSourceMap(
      path.join(absoluteWorkingDirectory, 'dist', pathChunk!),
    )
    const chunkConsumer = await new SourceMapConsumer(chunkMap)
    const chunkPosition = chunkConsumer.originalPositionFor({
      column: chunkColumn,
      line: chunkLine,
    })

    expect(chunkPosition.source).toBe('../src/lazy.ts')
  })

  it('story: remap Rollup warnings through nested temporary source maps', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)
    const pathDirectoryTemporary = await mkdtemp(path.join(tmpdir(), 'esroll-warning-test-'))

    onTestFinished(async () => {
      await rm(pathDirectoryTemporary, { force: true, recursive: true })
    })

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/pages/home/index.ts'),
      'export const page = 1\n',
    )

    process.chdir(absoluteWorkingDirectory)

    const resultESBuild = await buildESBuild({
      absWorkingDir: absoluteWorkingDirectory,
      bundle: true,
      entryNames: 'entries/[dir]/[name]-[hash]',
      entryPoints: ['src/pages/home/index.ts'],
      format: 'esm',
      metafile: true,
      outbase: 'src',
      outdir: pathDirectoryTemporary,
      sourcemap: 'external',
      write: true,
    })

    const { metafile } = resultESBuild

    if (metafile === undefined) {
      throw new Error('Expected esbuild metafile to be defined')
    }

    const sourceMapConsumers = await createSourcemapConsumers(metafile)
    const pathFileOutputRelative = Object.keys(
      await readDirectoryFiles(pathDirectoryTemporary),
    ).find((value) => value.endsWith('.js'))

    expect(pathFileOutputRelative).toBeDefined()

    const pathFileOutput = path.join(pathDirectoryTemporary, pathFileOutputRelative!)
    const code = await readFile(pathFileOutput, 'utf8')
    const line = code.includes('var page = 1;') ? 2 : 0
    const column = 4
    const messages: BuildMessages = { errors: [], warnings: [] }

    await createHandlerRollupLog({
      messages,
      pathDirectoryPackage: absoluteWorkingDirectory,
      pathDirectoryTemporary,
      sourceMapConsumers,
    })({
      code: 'TEST_WARNING',
      loc: { column, file: pathFileOutput, line },
      message: 'warning for sourcemap remap test',
      plugin: 'test-warning',
    })

    expect(messages.errors).toHaveLength(0)
    expect(messages.warnings).toHaveLength(1)
    expect(messages.warnings[0].location?.file).toBe('src/pages/home/index.ts')
    expect(messages.warnings[0].location?.line).toBe(1)
    expect(messages.warnings[0].location?.lineText).toContain('export const page = 1')
  })

  it('story: preserve file-loader assets across shared chunks and custom asset paths', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/shared.ts'),
      'import assetUrl from "./asset.txt"\nexport const shared = assetUrl\n',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/alpha.ts'),
      'import { shared } from "./shared"\nexport const alpha = shared\n',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/beta.ts'),
      'import { shared } from "./shared"\nexport const beta = shared\n',
    )
    await writeFixtureFile(path.join(absoluteWorkingDirectory, 'src/asset.txt'), 'hello asset\n')

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      assetNames: 'assets/[name]-[hash]',
      chunkNames: 'chunks/[name]-[hash]',
      entryPoints: ['src/alpha.ts', 'src/beta.ts'],
      loader: { '.txt': 'file' },
      logLevel: 'silent',
      outdir: 'dist',
      publicPath: 'https://cdn.example/v1',
      splitting: true,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const files = await readDirectoryFiles(path.join(absoluteWorkingDirectory, 'dist'))
    const pathChunk = Object.keys(files).find((value) => value.startsWith('chunks/chunk-'))
    const pathAsset = Object.keys(files).find((value) => value.startsWith('assets/asset-'))

    expect(pathChunk).toBeDefined()
    expect(pathAsset).toBeDefined()
    expect(files[pathAsset!]).toBe('hello asset\n')
    expect(files['alpha.js']).toContain('https://cdn.example/v1/chunks/')
    expect(files['beta.js']).toContain('https://cdn.example/v1/chunks/')
    expect(files[pathChunk!]).toContain('https://cdn.example/v1/assets/')
  })

  it('story: preserve copy-loader imports for JSON and arbitrary files', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/index.ts'),
      'import data from "./data.json" with { type: "json" }\nimport text from "./note.txt"\nexport { data, text }\n',
    )
    await writeFixtureFile(path.join(absoluteWorkingDirectory, 'src/data.json'), '{"value":1}\n')
    await writeFixtureFile(path.join(absoluteWorkingDirectory, 'src/note.txt'), 'copied note\n')

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      entryPoints: ['src/index.ts'],
      loader: {
        '.json': 'copy',
        '.txt': 'copy',
      },
      logLevel: 'silent',
      outdir: 'dist',
      rollup: {
        output: {
          importAttributesKey: 'assert',
        },
      },
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const files = await readDirectoryFiles(path.join(absoluteWorkingDirectory, 'dist'))
    const pathJSON = Object.keys(files).find((value) => value.endsWith('.json'))
    const pathText = Object.keys(files).find((value) => value.endsWith('.txt'))

    expect(pathJSON).toBeDefined()
    expect(pathText).toBeDefined()
    expect(files[pathJSON!]).toBe('{"value":1}\n')
    expect(files[pathText!]).toBe('copied note\n')
    expect(files['index.js']).toContain(`'./${pathJSON!}' assert { type: 'json' }`)
    expect(files['index.js']).toContain(`'./${pathText!}'`)
  })

  it('story: fail fast when copied imports with attributes would lose those attributes', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/index.ts'),
      'import data from "./data.json" with { type: "json" }\nexport default data\n',
    )
    await writeFixtureFile(path.join(absoluteWorkingDirectory, 'src/data.json'), '{"value":1}\n')

    await expect(
      build({
        absWorkingDir: absoluteWorkingDirectory,
        entryPoints: ['src/index.ts'],
        loader: { '.json': 'copy' },
        logLevel: 'silent',
        outdir: 'dist',
        rollup: {
          output: {
            externalImportAttributes: false,
          },
        },
      }),
    ).rejects.toThrow(
      'options.rollup.output.externalImportAttributes must not be false when copied imports use import attributes',
    )
  })

  it('story: preserve entryNames ext directories for JavaScript and CSS outputs', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/index.ts'),
      'import "./style.css"\nexport const value = 1\n',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/style.css'),
      '.page { color: red }\n',
    )

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      entryNames: 'entries/[ext]/[name]-[hash]',
      entryPoints: ['src/index.ts'],
      logLevel: 'silent',
      outdir: 'dist',
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const files = await readDirectoryFiles(path.join(absoluteWorkingDirectory, 'dist'))

    expect(
      Object.keys(files).some(
        (value) => value.startsWith('entries/js/index-') && value.endsWith('.js'),
      ),
    ).toBe(true)
    expect(
      Object.keys(files).some(
        (value) => value.startsWith('entries/css/index-') && value.endsWith('.css'),
      ),
    ).toBe(true)
  })

  it('story: preserve nested output paths for CSS bundles and copied assets', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/pages/home/index.ts'),
      'import "./style.css"\nexport const page = 1\n',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/pages/home/style.css'),
      '.page { background: url(./asset.txt) }\n',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/pages/home/asset.txt'),
      'nested asset\n',
    )

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      assetNames: 'assets/[dir]/[name]-[hash]',
      entryNames: 'entries/[dir]/[name]-[hash]',
      entryPoints: ['src/pages/home/index.ts'],
      loader: { '.txt': 'file' },
      logLevel: 'silent',
      outbase: 'src',
      outdir: 'dist',
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const files = await readDirectoryFiles(path.join(absoluteWorkingDirectory, 'dist'))
    const pathJavaScript = Object.keys(files).find(
      (value) => value.startsWith('entries/pages/home/index-') && value.endsWith('.js'),
    )
    const pathCSS = Object.keys(files).find(
      (value) => value.startsWith('entries/pages/home/index-') && value.endsWith('.css'),
    )
    const pathAsset = Object.keys(files).find((value) =>
      value.startsWith('assets/pages/home/asset-'),
    )

    expect(pathJavaScript).toBeDefined()
    expect(pathCSS).toBeDefined()
    expect(pathAsset).toBeDefined()
    expect(files[pathCSS!]).toContain('../../../assets/pages/home/')
  })

  it('story: preserve copy-loader public paths', async ({ onTestFinished }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/index.ts'),
      'import data from "./data.json" with { type: "json" }\nexport default data\n',
    )
    await writeFixtureFile(path.join(absoluteWorkingDirectory, 'src/data.json'), '{"value":1}\n')

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      entryPoints: ['src/index.ts'],
      loader: { '.json': 'copy' },
      logLevel: 'silent',
      outdir: 'dist',
      publicPath: 'https://cdn.example/v1',
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const files = await readDirectoryFiles(path.join(absoluteWorkingDirectory, 'dist'))
    const pathJSON = Object.keys(files).find((value) => value.endsWith('.json'))

    expect(pathJSON).toBeDefined()
    expect(files['index.js']).toContain(`https://cdn.example/v1/${pathJSON!}`)
  })

  it('story: emit CSS bundles, CSS modules, and CSS-only entry points', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/app.ts'),
      'import "./style.css"\nexport const app = 1\n',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/module.ts'),
      'import styles from "./style.module.css"\nexport default styles\n',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/style.css'),
      '.root { color: red }\n',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/style.module.css'),
      '.button { color: blue }\n',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/theme.css'),
      '.theme { color: green }\n',
    )

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      entryPoints: ['src/app.ts', 'src/module.ts', 'src/theme.css'],
      logLevel: 'silent',
      outdir: 'dist',
      splitting: true,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const files = await readDirectoryFiles(path.join(absoluteWorkingDirectory, 'dist'))

    expect(files['app.css']).toContain('.root')
    expect(files['module.css']).toContain('button')
    expect(files['module.js']).toContain('button')
    expect(files['theme.css']).toContain('.theme')
    expect(Object.keys(files)).not.toContain('theme.js')
  })

  it('story: emit CSS-only entry points without invoking Rollup JavaScript output', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/theme.css'),
      '.theme { background: url(./asset.txt) }\n',
    )
    await writeFixtureFile(path.join(absoluteWorkingDirectory, 'src/asset.txt'), 'theme asset\n')

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      entryPoints: ['src/theme.css'],
      loader: { '.txt': 'file' },
      logLevel: 'silent',
      outdir: 'dist',
      sourcemap: true,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const files = await readDirectoryFiles(path.join(absoluteWorkingDirectory, 'dist'))
    const pathAsset = Object.keys(files).find((value) => value.endsWith('.txt'))

    expect(pathAsset).toBeDefined()
    expect(Object.keys(files)).not.toContain('theme.js')
    expect(files['theme.css']).toContain(`./${pathAsset!}`)
    expect(files['theme.css.map']).toContain('"../src/theme.css"')
  })

  it('story: preserve chunkNames templates for shared chunks', async ({ onTestFinished }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/shared.ts'),
      'export const shared = 1\n',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/alpha.ts'),
      'import { shared } from "./shared"\nexport const alpha = shared\n',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/beta.ts'),
      'import { shared } from "./shared"\nexport const beta = shared\n',
    )

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      chunkNames: 'chunks/[ext]/[name]-[hash]',
      entryPoints: ['src/alpha.ts', 'src/beta.ts'],
      logLevel: 'silent',
      outdir: 'dist',
      outExtension: { '.js': '.mjs' },
      publicPath: 'https://cdn.example/v1',
      splitting: true,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const files = await readDirectoryFiles(path.join(absoluteWorkingDirectory, 'dist'))
    const pathChunk = Object.keys(files).find(
      (value) => value.startsWith('chunks/mjs/chunk-') && value.endsWith('.mjs'),
    )

    expect(pathChunk).toBeDefined()
    expect(files['alpha.mjs']).toContain(`https://cdn.example/v1/${pathChunk!}`)
    expect(files['beta.mjs']).toContain(`https://cdn.example/v1/${pathChunk!}`)
  })

  it('story: preserve publicPath for dynamic imports and inline sourcemaps', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/index.ts'),
      'export const load = () => import("./lazy")\n',
    )
    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/lazy.ts'),
      'export const lazy = 1\n',
    )

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      entryPoints: ['src/index.ts'],
      logLevel: 'silent',
      outdir: 'dist',
      publicPath: 'https://cdn.example/v1',
      sourcemap: 'inline',
      splitting: true,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const files = await readDirectoryFiles(path.join(absoluteWorkingDirectory, 'dist'))
    const pathChunk = Object.keys(files).find(
      (value) => value !== 'index.js' && value.endsWith('.js'),
    )

    expect(pathChunk).toBeDefined()
    expect(files['index.js']).toContain(`https://cdn.example/v1/${pathChunk!}`)
    expect(files['index.js']).toContain('sourceMappingURL=data:application/json')
    expect(files[pathChunk!]).toContain('sourceMappingURL=data:application/json')
  })

  for (const sourcemap of [false, true, 'external', 'inline'] as const) {
    it(`story: preserve CSS assets and sourcemaps (${String(sourcemap)})`, async ({
      onTestFinished,
    }) => {
      const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

      await writeFixtureFile(
        path.join(absoluteWorkingDirectory, 'src/index.ts'),
        'import "./style.css"\nexport const value = 1\n',
      )
      await writeFixtureFile(
        path.join(absoluteWorkingDirectory, 'src/style.css'),
        '.hero { background: url(./asset.txt) }\n',
      )
      await writeFixtureFile(path.join(absoluteWorkingDirectory, 'src/asset.txt'), 'css asset\n')

      const result = await build({
        absWorkingDir: absoluteWorkingDirectory,
        entryPoints: ['src/index.ts'],
        loader: { '.txt': 'file' },
        logLevel: 'silent',
        outdir: 'dist',
        sourcemap,
        sourceRoot: 'https://cdn.example/src',
      })

      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)

      const files = await readDirectoryFiles(path.join(absoluteWorkingDirectory, 'dist'))
      const pathAsset = Object.keys(files).find((value) => value.endsWith('.txt'))

      expect(pathAsset).toBeDefined()
      expect(files[pathAsset!]).toBe('css asset\n')
      expect(files['index.css']).toContain(`./${pathAsset!}`)

      const cssMap = files['index.css.map'] ?? ''
      const sourceMapInline = files['index.css'].includes(
        'sourceMappingURL=data:application/json;base64,',
      )
      const sourceMapLinked = files['index.css'].includes('sourceMappingURL=index.css.map')
      const base64 = /base64,([^*]+)/.exec(files['index.css'])?.[1]?.trim() ?? ''
      const inlineMap = base64 === '' ? '' : Buffer.from(base64, 'base64').toString('utf8')

      expect('index.css.map' in files).toBe(sourcemap === true || sourcemap === 'external')
      expect(sourceMapLinked).toBe(sourcemap === true)
      expect(sourceMapInline).toBe(sourcemap === 'inline')
      expect(files['index.css'].includes('sourceMappingURL=')).toBe(
        sourcemap === true || sourcemap === 'inline',
      )
      expect(cssMap.includes('"../src/style.css"')).toBe(
        sourcemap === true || sourcemap === 'external',
      )
      expect(cssMap.includes('"sourceRoot": "https://cdn.example/src"')).toBe(
        sourcemap === true || sourcemap === 'external',
      )
      expect(inlineMap.includes('"sourceRoot": "https://cdn.example/src"')).toBe(
        sourcemap === 'inline',
      )
    })
  }

  it('story: generate declarations, roll them up, and write API documentation', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)
    await createPackageFixture(absoluteWorkingDirectory)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            declarationDir: 'types',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            rootDir: 'src',
            skipLibCheck: true,
            target: 'ES2022',
            types: [],
          },
          include: ['src/**/*.ts'],
        },
        null,
        2,
      ),
    )

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/contracts/public-api.ts'),
      '/** Primary API contract */\nexport interface PublicApi {\n  value: string\n}\n',
    )

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/contracts/secondary-api.ts'),
      '/** Secondary API contract */\nexport interface SecondaryApi {\n  id: number\n}\n',
    )

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/index.ts'),
      'import type { PublicApi } from "./contracts/public-api"\nimport type { SecondaryApi } from "./contracts/secondary-api"\n\nexport type { PublicApi } from "./contracts/public-api"\nexport type { SecondaryApi } from "./contracts/secondary-api"\n\nexport const createApi = (): { primary: PublicApi; secondary: SecondaryApi } => ({\n  primary: { value: "ok" },\n  secondary: { id: 1 },\n})\n',
    )

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'README.md'),
      '# fixture\n\n## Usage\n\nUse esroll.\n\n# API\n\nlegacy api section that should be replaced\n',
    )

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      declaration: true,
      declarationRollup: true,
      documentation: true,
      entryPoints: ['src/index.ts'],
      logLevel: 'silent',
      tsconfig: 'tsconfig.json',
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const declarationFile = result.outputFiles.find((value) =>
      value.path.endsWith('/types/index.d.ts'),
    )
    const readmeFile = result.outputFiles.find((value) => value.path.endsWith('/README.md'))

    expect(declarationFile).toBeDefined()
    expect(readmeFile).toBeDefined()

    const declarationContent = await readFile(declarationFile!.path, 'utf8')
    expect(declarationContent).toContain('export declare interface PublicApi')
    expect(declarationContent).toContain('export declare interface SecondaryApi')

    const readmeContent = await readFile(readmeFile!.path, 'utf8')
    expect(readmeContent).toContain('# API')
    expect(readmeContent).toContain('interface PublicApi')
    expect(readmeContent).toContain('interface SecondaryApi')
    expect(readmeContent).not.toContain('legacy api section that should be replaced')
  }, 30_000)

  it('story: generate declaration rollups without warning on source declaration imports', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)
    await createPackageFixture(absoluteWorkingDirectory)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            declarationDir: 'types',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            rootDir: 'src',
            skipLibCheck: true,
            target: 'ES2022',
            types: [],
          },
          include: ['src'],
        },
        null,
        2,
      ),
    )

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/types.ts'),
      '/** @public */\nexport interface PublicApi {\n  value: string\n}\n',
    )

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/global.d.ts'),
      'import type { PublicApi } from "./types"\n\ndeclare global {\n  var __PUBLIC_API__: PublicApi | undefined\n}\n\nexport {}\n',
    )

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/index.ts'),
      'export type { PublicApi } from "./types"\n',
    )

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      declaration: true,
      declarationRollup: true,
      entryPoints: ['src/index.ts'],
      logLevel: 'silent',
      tsconfig: 'tsconfig.json',
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const declarationFile = result.outputFiles.find((value) =>
      value.path.endsWith('/types/index.d.ts'),
    )

    expect(declarationFile).toBeDefined()
    expect(await readFile(declarationFile!.path, 'utf8')).toContain(
      'export declare interface PublicApi',
    )
  }, 30_000)

  it('story: generate declaration rollups for Error subclasses with newer project TypeScript', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)
    await createPackageFixture(absoluteWorkingDirectory)

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            declarationDir: 'types',
            lib: ['ESNext'],
            module: 'ESNext',
            moduleResolution: 'Bundler',
            rootDir: 'src',
            skipLibCheck: true,
            target: 'ESNext',
            types: [],
          },
          include: ['src'],
        },
        null,
        2,
      ),
    )

    await writeFixtureFile(
      path.join(absoluteWorkingDirectory, 'src/index.ts'),
      'export class PublicError extends Error {\n  readonly name = "PublicError" as const\n}\n',
    )

    const result = await build({
      absWorkingDir: absoluteWorkingDirectory,
      declaration: true,
      declarationRollup: true,
      entryPoints: ['src/index.ts'],
      logLevel: 'silent',
      tsconfig: 'tsconfig.json',
    })

    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const declarationFile = result.outputFiles.find((value) =>
      value.path.endsWith('/types/index.d.ts'),
    )

    expect(declarationFile).toBeDefined()
    expect(await readFile(declarationFile!.path, 'utf8')).toContain(
      'export declare class PublicError extends Error',
    )
  }, 30_000)

  it('story: fail fast when declaration generation is requested without tsconfig', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await expect(
      build({
        absWorkingDir: absoluteWorkingDirectory,
        declaration: true,
        entryPoints: ['src/index.ts'],
        logLevel: 'silent',
      }),
    ).rejects.toThrow('options.tsconfig must be set when options.declaration is true')
  })

  it('story: fail fast when documentation is enabled without declarations', async ({
    onTestFinished,
  }) => {
    const absoluteWorkingDirectory = await createTemporaryWorkspace(onTestFinished)

    await expect(
      build({
        absWorkingDir: absoluteWorkingDirectory,
        documentation: true,
        entryPoints: ['src/index.ts'],
        logLevel: 'silent',
        outdir: 'dist',
      }),
    ).rejects.toThrow(
      'options.declaration must be true when options.declarationRollup or options.documentation is set',
    )
  })
})
