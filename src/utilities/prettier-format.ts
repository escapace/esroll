import type * as Prettier from 'prettier'
import { resolve as resolveModule } from 'mlly'
import path from 'node:path'

export const prettierFormat = async (
  content: string,
  options: {
    filePath: string
    pathDirectoryPackage: string
  },
) => {
  const { filePath, pathDirectoryPackage } = options

  try {
    const pathFilePrettier = await resolveModule('prettier', { url: pathDirectoryPackage })
    const prettier = (await import(pathFilePrettier)) as typeof Prettier

    const config = await prettier.resolveConfig(pathDirectoryPackage, { editorconfig: true })

    if (config === null) {
      return content
    }

    const { ignored, inferredParser: parser } = await prettier.getFileInfo(filePath, {
      ignorePath: [
        path.join(pathDirectoryPackage, '.prettierignore'),
        path.join(pathDirectoryPackage, '.gitignore'),
      ],
    })

    if (ignored || parser === null) {
      return content
    }

    return await prettier.format(content, {
      ...config,
      filepath: filePath,
      parser,
    })
  } catch {
    return content
  }
}
