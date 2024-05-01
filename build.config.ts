import { exec as _exec } from 'node:child_process'
import { promisify } from 'node:util'
import { build } from './src/index'
const exec = promisify(_exec)

await build({
  absWorkingDir: import.meta.dirname,
  entryPoints: ['src/index.ts'],
  mainFields: ['module', 'main'],
  outdir: 'lib/esm',
  outExtension: {
    '.js': '.mjs',
  },
  packages: 'external',
  platform: 'node',
  sourcemap: true,
  sourcesContent: false,
  splitting: true,
  supported: {
    'const-and-let': true,
  },
  target: ['node20.12.0'],
  treeShaking: true,
  tsconfig: 'tsconfig-build.json',
})

await exec(
  'pnpm exec tsc -p ./tsconfig-build.json --emitDeclarationOnly --declarationDir lib/types',
)
