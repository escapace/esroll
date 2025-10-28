import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPathImmediatelyInside } from './is-path-immediately-inside'

describe('isPathImmediatelyInside', () => {
  it('returns true for direct descendants on posix', () => {
    const cases: Array<[string, string]> = [
      ['a', '.'],
      ['a', './'],
      ['a/', '.'],
      ['a/', './'],
      ['a/b', 'a'],
      ['a/b', 'a/'],
      ['a/b/', 'a'],
      ['a/b/', 'a/'],
      ['a/../b', '.'],
      ['a/../b', './'],
      ['../a', '..'],
      ['../a', '../'],
      ['../a/', '..'],
      ['../a/', '../'],
      ['/a', '/'],
      ['/a/', '/'],
      ['/a/b', '/a'],
      ['/a/b', '/a/'],
      ['/a/b/', '/a'],
      ['/a/b/', '/a/'],
    ]

    for (const [child, parent] of cases) {
      expect(isPathImmediatelyInside(child, parent)).toBe(true)
    }
  })

  it('returns false when the path is not an immediate descendant on posix', () => {
    const cases: Array<[string, string]> = [
      ['..', '.'],
      ['.', '.'],
      ['.', './'],
      ['./', '.'],
      ['./', './'],
      ['a', '..'],
      ['a', '../'],
      ['a/', '..'],
      ['a/', '../'],
      ['a', 'a'],
      ['a', 'a/'],
      ['a/', 'a'],
      ['a/', 'a/'],
      ['a/b', '.'],
      ['a/b', './'],
      ['a/b/c', 'a'],
      ['a/b/c', 'a/'],
      ['a/b/c/', 'a'],
      ['a/b/c/', 'a/'],
      ['a/../b', 'a'],
      ['/a/b', '/'],
      ['/a/b/', '/'],
    ]

    for (const [child, parent] of cases) {
      expect(isPathImmediatelyInside(child, parent)).toBe(false)
    }
  })

  it('handles win32 style separators', () => {
    const previousRelative = path.relative.bind(path)
    const previousResolve = path.resolve.bind(path)
    const previousSeparator = path.sep

    path.relative = path.win32.relative.bind(path.win32)
    path.resolve = path.win32.resolve.bind(path.win32)
    Object.defineProperty(path, 'sep', { value: path.win32.sep })

    try {
      const positiveCases: Array<[string, string]> = [
        ['a', '.'],
        ['a', '.\\'],
        ['a\\', '.'],
        ['a\\', '.\\'],
        ['a\\b', 'a'],
        ['a\\b', 'a\\'],
        ['a\\b\\', 'a'],
        ['a\\b\\', 'a\\'],
        ['a\\..\\b', '.'],
        ['C:\\a\\b', 'C:\\a'],
        ['C:\\a\\b\\c', 'C:\\a\\b'],
        ['..\\a', '..'],
        ['..\\a', '..\\'],
        ['..\\a\\', '..'],
        ['..\\a\\', '..\\'],
      ]

      for (const [child, parent] of positiveCases) {
        expect(isPathImmediatelyInside(child, parent)).toBe(true)
      }

      const negativeCases: Array<[string, string]> = [
        ['..', '.'],
        ['.', '.'],
        ['.', '.\\'],
        ['.\\', '.'],
        ['.\\', '.\\'],
        ['a', '..'],
        ['a', '..\\'],
        ['a\\', '..'],
        ['a\\', '..\\'],
        ['a', 'a'],
        ['a', 'a\\'],
        ['a\\', 'a'],
        ['a\\', 'a\\'],
        ['a\\b', '.'],
        ['a\\b', '.\\'],
        ['a\\b\\c', 'a'],
        ['a\\b\\c', 'a\\'],
        ['a\\..\\b', 'a'],
        ['C:\\a\\b\\c\\d', 'C:\\a\\b'],
      ]

      for (const [child, parent] of negativeCases) {
        expect(isPathImmediatelyInside(child, parent)).toBe(false)
      }
    } finally {
      path.relative = previousRelative
      path.resolve = previousResolve
      Object.defineProperty(path, 'sep', { value: previousSeparator })
    }
  })
})
