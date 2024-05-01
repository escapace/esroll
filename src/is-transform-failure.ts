import type { TransformFailure } from './types'

export const isTransformFailure = (value: unknown): value is TransformFailure => {
  const failure = value as Partial<TransformFailure>

  return (
    typeof failure === 'object' &&
    ((Array.isArray(failure.errors) && failure.errors.length > 0) ||
      (Array.isArray(failure.warnings) && failure.warnings.length > 0))
  )
}
