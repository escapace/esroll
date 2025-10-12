import type { BuildMessages } from '../types'

export const isTransformFailure = (value: unknown): value is BuildMessages => {
  const failure = value as Partial<BuildMessages>

  return (
    typeof failure === 'object' &&
    ((Array.isArray(failure.errors) && failure.errors.length > 0) ||
      (Array.isArray(failure.warnings) && failure.warnings.length > 0))
  )
}
