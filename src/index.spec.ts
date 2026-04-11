import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { build, type BuildOptions } from './index'

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
