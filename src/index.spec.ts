import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { build, type BuildOptions } from './index'

describe('esroll integration test', () => {
  it('should bundle a TypeScript file', async ({ onTestFinished }) => {
    // Create a temporary directory
    // eslint-disable-next-line unicorn/prevent-abbreviations
    const absWorkingDir = await mkdtemp(path.join(tmpdir(), 'esroll-test-'))
    onTestFinished(async () => {
      await rm(absWorkingDir, { force: true, recursive: true })
    })

    // Write a sample TypeScript file
    const sampleFilePath = path.join(absWorkingDir, 'sample.ts')
    await writeFile(sampleFilePath, 'export const greet = () => "Hello, world!";')

    // Build the TypeScript file using esroll
    const buildOptions: BuildOptions = {
      absWorkingDir,
      entryPoints: [sampleFilePath],
      logLevel: 'silent',
      outdir: path.join(absWorkingDir, 'output/files/'),
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

    // Verify the output
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
    expect(result.outputFiles).toHaveLength(2)
    expect(await readFile(result.outputFiles[0].path)).toMatchSnapshot()
    expect(await readFile(result.outputFiles[1].path)).toMatchSnapshot()
  })
})
