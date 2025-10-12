import { isTransformFailure } from './is-transform-failure'
import type { BuildMessages } from '../types'

export const transformFailureFlatten = (...values: unknown[]) =>
  values.reduce<BuildMessages>(
    (accumulator, value) => {
      if (isTransformFailure(value)) {
        accumulator.errors?.push(...(value.errors ?? []))
        accumulator.warnings?.push(...(value.warnings ?? []))
      }

      return accumulator
    },
    { errors: [], warnings: [] },
  )
