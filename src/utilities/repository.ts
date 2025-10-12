import path from 'node:path'
import * as zx from 'zx'
import { memoize } from 'es-toolkit'
import hostedGitInfo from 'hosted-git-info'

const respositoryPathResolve = memoize((filePath: string) => {
  const processOutput = zx.$.sync({
    nothrow: true,
  })`git ls-files --error-unmatch --full-name ${filePath}`

  if (processOutput.exitCode !== 0) {
    return
  }

  const lines = processOutput.lines()

  if (lines.length !== 1) {
    return
  }

  const value = lines[0]

  if (path.isAbsolute(value)) {
    return
  }

  return value
})

const repositoryCurrentCommit = memoize(() => {
  const processOutput = zx.$.sync({
    nothrow: true,
  })`git rev-parse HEAD`

  if (processOutput.exitCode !== 0) {
    return
  }

  const lines = processOutput.lines()

  if (lines.length !== 1) {
    return
  }

  return lines[0]
})

export const repositoryFileURL = memoize((filePath: string) => {
  const processOutput = zx.$.sync({
    nothrow: true,
  })`git remote get-url origin`

  if (processOutput.exitCode !== 0) {
    return
  }

  const lines = processOutput.lines()

  if (lines.length !== 1) {
    return
  }

  const hosted = hostedGitInfo.fromUrl(lines[0])

  if (hosted === undefined) {
    return undefined
  }

  const commit = repositoryCurrentCommit()

  if (commit === undefined) {
    return
  }

  const repositoryPath = respositoryPathResolve(filePath)

  if (repositoryPath === undefined) {
    return
  }

  const browseFile = (Reflect.get(hosted, 'browseFile') as (typeof hosted)['file']).bind(hosted)

  return browseFile(repositoryPath, {
    committish: commit,
  })
})
