# esroll

esroll is a build tool that combines [esbuild](https://esbuild.github.io) and [rollup](https://rollupjs.org) to bundle TypeScript and JavaScript projects. The tool generates TypeScript declaration files from source code and bundles them into a single declaration file using Microsoft's [API Extractor](https://api-extractor.com). It optionally produces API documentation using API Extractor and tools from the [remark](https://github.com/remarkjs/remark) ecosystem.

## Installation

```bash
pnpm add -D esroll
```

## Examples

Bundle TypeScript source files to an output directory with code splitting and source maps:

```typescript
import { build } from 'esroll'

await build({
  entryPoints: ['src/index.ts'],
  outdir: 'dist',
  sourcemap: true,
  splitting: true,
  treeShaking: true,
  tsconfig: 'tsconfig.json',
})
```

Generate TypeScript declarations, bundle them into a single file, and produce API documentation:

```typescript
import { build } from 'esroll'

await build({
  declaration: true,
  declarationRollup: true,
  documentation: true,
  entryPoints: ['src/index.ts'],
  tsconfig: 'tsconfig.json',
})
```

# API

## function build [↗](src/index.ts#L139-L154 'build')

Bundles source files, generates TypeScript declarations, and writes documentation based on the specified options.

```typescript
export declare function build(options: BuildOptions): Promise<BuildResult>
```

### Parameters

| Parameter | Type                                                                         | Description                                                                        |
| --------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `options` | <pre>[BuildOptions](#interface-buildoptions- 'interface BuildOptions')</pre> | Build configuration including entry points, output settings, and compilation flags |

### Returns

Build result containing errors, warnings, and paths to the generated output files

### Throws

When the build process encounters fatal errors during bundling or declaration generation

### Remarks

Either [options.outdir](#buildoptionsoutdir) or [options.declaration](#buildoptionsdeclaration) must be set. When [options.outdir](#buildoptionsoutdir) is specified, source files are bundled to the output directory.

When [options.declaration](#buildoptionsdeclaration) is true, TypeScript declarations are generated and written to the directory specified by the tsconfig compilerOptions.declarationDir setting.

Setting [options.documentation](#buildoptionsdocumentation) enables API documentation generation alongside declarations. Setting [options.declarationRollup](#buildoptionsdeclarationrollup) to true bundles the generated declarations.

When both [options.outdir](#buildoptionsoutdir) and [options.declaration](#buildoptionsdeclaration) are set, bundling executes first, declaration generation runs second, and documentation writes last.

## interface BuildOptions [↗](src/types.ts#L39-L169 'BuildOptions')

Configuration options for the build process.

Extends esbuild's build options while omitting options that conflict with the esroll's internal behavior. Adds support for declaration file generation, documentation extraction, and rollup integration.

```typescript
export interface BuildOptions extends Omit<ESBuildOptions, BuildOptionsExcluded>
```

### BuildOptions.declaration

Generate TypeScript declaration files (.d.ts).

```typescript
declaration?: boolean;
```

#### Remarks

Either this property or [outdir](#buildoptionsoutdir) must be set. When enabled, declaration files are generated alongside documentation extraction.

### BuildOptions.declarationRollup

Bundle declaration files.

```typescript
declarationRollup?: boolean;
```

#### Remarks

Requires [declaration](#buildoptionsdeclaration) to be true.

### BuildOptions.declarationRollupPackages

Package declarations to bundle with declaration rollup.

```typescript
declarationRollupPackages?: string[];
```

#### Remarks

Requires [declarationRollup](#buildoptionsdeclarationrollup) to be true.

### BuildOptions.documentation

Generate API documentation.

```typescript
documentation?: boolean | string;
```

#### Remarks

Requires [declaration](#buildoptionsdeclaration) to be true. When set to `true`, documentation is generated and either replaces or appends the matching section in `README.md`. When set to a string, the value identifies an alternate markdown file that must sit directly inside the package directory and receives the same replacement or append behavior described by [documentationHeading](#buildoptionsdocumentationheading).

### BuildOptions.documentationHeading

Markdown heading that identifies the API documentation section.

```typescript
documentationHeading?: string;
```

#### Remarks

The value must include the leading `#` markers, whose count determines the required heading depth. External markdown provided through [documentation](#buildoptionsdocumentation) must contain a heading whose depth and text match this configuration; matching sections are replaced and the content is appended when no matching heading exists. Applies when [documentation](#buildoptionsdocumentation) is `true` or set to a string.

### BuildOptions.documentationIncludeForgottenExports

Include forgotten exports in the documentation.

```typescript
documentationIncludeForgottenExports?: boolean;
```

#### Remarks

Requires [documentation](#buildoptionsdocumentation) to be true.

### BuildOptions.entryPoints

Entry point files to bundle.

```typescript
entryPoints: string[];
```

### BuildOptions.logLevel

Logging verbosity level.

```typescript
logLevel?: 'error' | 'info' | 'silent';
```

### BuildOptions.outdir

Output file directory for bundled source files.

```typescript
outdir?: string;
```

#### Remarks

At least one of [outdir](#buildoptionsoutdir) or [declaration](#buildoptionsdeclaration) must be set. When specified, source files are bundled to this directory.

### BuildOptions.rollup

Rollup bundler configuration.

```typescript
rollup?: {
  output?: {
      generatedCode?: GeneratedCodeOptions;
  } & Partial<Pick<OutputOptions, 'exports' | 'externalImportAttributes' | 'importAttributesKey' | 'minifyInternalExports' | 'sanitizeFileName'>>;
  plugins?: Plugin[];
  treeshake?: TreeshakingOptions;
} & Partial<Pick<RollupOptions, 'experimentalLogSideEffects' | 'maxParallelFileOps'>>;
```

### BuildOptions.sourcemap

Source map generation mode.

```typescript
sourcemap?: boolean | 'external' | 'inline' | 'linked';
```

#### Remarks

Controls whether and how source maps are generated for the bundled output.

- When set to false or undefined, no source maps are produced.
- When set to true or 'linked', the bundler generates separate .map files alongside the output files and appends a sourceMappingURL comment to each output file that references its corresponding map file location.
- The 'inline' mode embeds source maps directly into the output files as base64-encoded data URIs.
- The 'external' mode writes source maps to separate .map files alongside the output files but omits the sourceMappingURL comment

## interface BuildResult [↗](src/types.ts#L174-L187 'BuildResult')

Result of a build operation.

```typescript
export interface BuildResult
```

### BuildResult.errors

Errors that occurred during the build.

```typescript
errors: PartialMessage[];
```

### BuildResult.outputFiles

Paths of generated output files.

```typescript
outputFiles: Array<Pick<OutputFile, 'path'>>
```

### BuildResult.warnings

Warnings that occurred during the build.

```typescript
warnings: PartialMessage[];
```

## type BuildOptionsExcluded [↗](src/types.ts#L16-L30 'BuildOptionsExcluded')

ESBuild options that esroll manages internally and excludes from user configuration.

```typescript
export type BuildOptionsExcluded =
  | 'absPaths'
  | 'allowOverwrite'
  | 'bundle'
  | 'entryPoints'
  | 'format'
  | 'globalName'
  | 'metafile'
  | 'minify'
  | 'outdir'
  | 'outfile'
  | 'sourcemap'
  | 'stdin'
  | 'tsconfigRaw'
  | 'write'
```
