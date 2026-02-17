import path from 'node:path'
import { assert, describe, expect, it } from 'vitest'
import { createDocumentation } from './index'
import { isFile } from '../utilities/is-file'
import { toMarkdown } from './markdown'

describe('create-documentation', () => {
  for (const option of ['a', 'b', 'c', 'd', 'e', 'f']) {
    it(`snapshot ${option}`, async () => {
      const json = path.join(import.meta.dirname, `../test-support/${option}.api.json`)
      assert(await isFile(json))

      expect(
        toMarkdown(
          ...createDocumentation({
            modelFilePath: json,
          })!.children,
        ),
      ).toMatchSnapshot()
    })
  }
})
