// @ts-check
import { escapace, compose } from 'eslint-config-escapace'

export default compose(
  escapace(),
  {
    rules: {
      'depend/ban-dependencies': ['error', { allowed: ['find-up'] }],
    },
  },
  {
    files: ['**/*.?([cm])[jt]s?(x)'],
    rules: {
      'unicorn/name-replacements': [
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
          replacements: { configuration: false },
        },
      ],
    },
  },
)
