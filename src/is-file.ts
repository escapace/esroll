import fs from 'node:fs/promises'

export const isFile = async (path: string) =>
  await fs
    .stat(path)
    .then((stats) => stats.isFile())
    .catch(() => false)
