// @ts-check
import { escapace, compose } from 'eslint-config-escapace'

export default compose(escapace(), {
  ignores: ['./src/core/**'],
  rules: {
    'depend/ban-dependencies': ['error', { allowed: ['find-up', 'lodash-es'] }],
  },
})
