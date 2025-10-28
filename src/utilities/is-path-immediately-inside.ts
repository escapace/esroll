import path from 'node:path'

export const isPathImmediatelyInside = (childPath: string, parentPath: string) => {
  const relation = path.relative(parentPath, childPath)

  if (
    relation.length === 0 ||
    relation === '.' ||
    relation === '..' ||
    relation.startsWith(`..${path.sep}`) ||
    relation === path.resolve(childPath)
  ) {
    return false
  }

  const alternateSeparator = path.sep === '/' ? '\\' : '/'

  if (relation.includes(path.sep) || relation.includes(alternateSeparator)) {
    return false
  }

  return true
}
