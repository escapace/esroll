import type { ImportKind, Loader, Metafile } from 'esbuild'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEsbuildOutputCatalog } from './create-esbuild-output-catalog'

const pathDirectoryPackage = path.join(path.sep, 'repo')
const pathDirectoryTemporary = path.join(pathDirectoryPackage, '.esroll')
const outputExtensions = { css: '.min.css', js: '.min.js' }

interface InputDefinition {
  imports?: Array<{ kind: ImportKind; path: string; with?: Record<string, string> }>
}

interface OutputDefinition {
  pathOutput: string
  entryPoint?: string
  exports?: string[]
  imports?: Array<{ kind: 'file-loader' | ImportKind; path: string }>
  inputPaths?: string[]
}

const createMetafile = (options: {
  outputs: OutputDefinition[]
  inputs?: Record<string, InputDefinition>
}): Metafile => ({
  inputs: Object.fromEntries(
    Object.entries(options.inputs ?? {}).map(([pathInput, value]) => [
      pathInput,
      {
        bytes: 1,
        imports: value.imports ?? [],
      },
    ]),
  ),
  outputs: Object.fromEntries(
    options.outputs.map((value) => [
      path.join(pathDirectoryTemporary, value.pathOutput),
      {
        bytes: 1,
        entryPoint: value.entryPoint,
        exports: value.exports ?? [],
        imports: value.imports ?? [],
        inputs: Object.fromEntries(
          (value.inputPaths ?? []).map((pathInput) => [pathInput, { bytesInOutput: 1 }]),
        ),
      },
    ]),
  ),
})

const createCatalog = (options: {
  outputs: OutputDefinition[]
  inputs?: Record<string, InputDefinition>
  loaders?: Record<string, Loader | undefined>
}) =>
  createEsbuildOutputCatalog({
    loaders: options.loaders ?? {},
    metafile: createMetafile({ inputs: options.inputs, outputs: options.outputs }),
    outputExtensions,
    pathDirectoryPackage,
    pathDirectoryTemporary,
  })

describe('createEsbuildOutputCatalog', () => {
  const classificationCases: Array<{
    expectedKind: 'asset' | 'css' | 'js-chunk' | 'js-entry'
    output: OutputDefinition
    title: string
    loaders?: Record<string, Loader | undefined>
  }> = [
    {
      expectedKind: 'css',
      output: { entryPoint: 'src/style.css', pathOutput: 'style.min.css' },
      title: 'classifies empty-input CSS entry outputs by semantic kind before Rollup refinement',
    },
    {
      expectedKind: 'asset',
      loaders: { '.txt': 'file' },
      output: { entryPoint: 'src/data.txt', pathOutput: 'data.txt' },
      title: 'classifies empty-input asset entry outputs by semantic kind before Rollup refinement',
    },
    {
      expectedKind: 'js-entry',
      output: { entryPoint: 'src/index.ts', pathOutput: 'index.min.js' },
      title: 'refines empty-input module entry outputs into js-entry',
    },
    {
      expectedKind: 'js-chunk',
      output: { pathOutput: 'chunk.min.js' },
      title: 'refines empty-input module helper outputs into js-chunk',
    },
    {
      expectedKind: 'asset',
      loaders: { '.js': 'copy' },
      output: {
        inputPaths: ['src/copy-me.js'],
        pathOutput: 'copy-me-ABC123.min.js',
      },
      title: 'keeps copied JavaScript files as assets when esbuild reports no module linkage',
    },
    {
      expectedKind: 'js-entry',
      loaders: { '.txt': 'file' },
      output: {
        entryPoint: 'src/data.txt',
        exports: ['default'],
        imports: [{ kind: 'file-loader', path: './data-ABC123.txt' }],
        inputPaths: ['src/data.txt'],
        pathOutput: 'data.min.js',
      },
      title: 'refines asset-loader JavaScript wrappers with module linkage into js-entry',
    },
    {
      expectedKind: 'js-entry',
      output: {
        entryPoint: 'src/index.ts',
        exports: ['value'],
        inputPaths: ['src/index.ts'],
        pathOutput: 'entries/min.js/index-ABC123.min.js',
      },
      title: 'classifies multi-part JavaScript output extensions as modules',
    },
    {
      expectedKind: 'css',
      output: {
        entryPoint: 'src/style.css',
        inputPaths: ['src/style.css'],
        pathOutput: 'entries/min.css/index-ABC123.min.css',
      },
      title: 'classifies multi-part CSS output extensions as css passthrough outputs',
    },
  ]

  it.each(classificationCases)('$title', ({ expectedKind, loaders, output }) => {
    const catalog = createCatalog({ loaders, outputs: [output] })

    expect(catalog.outputs).toHaveLength(1)
    expect(catalog.outputs[0].kind).toBe(expectedKind)
  })

  it('partitions semantic kinds into Rollup inputs and passthrough outputs without overlap', () => {
    const catalog = createCatalog({
      loaders: {
        '.txt': 'file',
      },
      outputs: [
        {
          entryPoint: 'src/index.ts',
          exports: ['value'],
          inputPaths: ['src/index.ts'],
          pathOutput: 'index.min.js',
        },
        {
          pathOutput: 'chunk.min.js',
        },
        {
          entryPoint: 'src/style.css',
          pathOutput: 'style.min.css',
        },
        {
          inputPaths: ['src/data.txt'],
          pathOutput: 'data-ABC123.txt',
        },
      ],
    })

    expect(catalog.outputs.map((value) => [value.relativePath, value.kind])).toEqual([
      ['index.min.js', 'js-entry'],
      ['chunk.min.js', 'js-chunk'],
      ['style.min.css', 'css'],
      ['data-ABC123.txt', 'asset'],
    ])
    expect(catalog.javascriptEntries.map((value) => value.relativePath)).toEqual(['index.min.js'])
    expect(catalog.passthroughOutputs.map((value) => value.relativePath)).toEqual([
      'style.min.css',
      'data-ABC123.txt',
    ])
    expect(
      [...catalog.passthroughExternalPaths].map((value) =>
        path.relative(pathDirectoryTemporary, value),
      ),
    ).toEqual(['style.min.css', 'data-ABC123.txt'])
  })
})
