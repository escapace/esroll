// @ts-check
import { escapace, compose } from 'eslint-config-escapace'

export default compose(escapace(), {
  rules: {
    'depend/ban-dependencies': ['error', { allowed: ['find-up'] }],
    'unicorn/prevent-abbreviations': [
      'error',
      {
        allowList: {
          fromTSDocNode: true,
          FromTSDocNodeOptions: true,
          isTSDocNodeKind: true,
          TSDocMarkdownWriter: true,
          TSDocMarkdownWriterOptions: true,
          TSDocMarkdownWriterState: true,
        },
      },
    ],
  },
})
