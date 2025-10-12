import { Table } from 'console-table-printer'
import * as zx from 'zx'

export const createTable = () =>
  new Table({
    columns: [
      { alignment: 'left', name: 'file' },
      { alignment: 'right', name: 'size' },
    ],
    shouldDisableColors: zx.chalk.level !== 0,
    style: {
      headerBottom: {
        left: '',
        mid: '',
        other: '',
        right: '',
      },
      headerTop: {
        left: '',
        mid: '',
        other: '',
        right: '',
      },
      tableBottom: {
        left: '',
        mid: '',
        other: '',
        right: '',
      },
      vertical: ' ',
    },
  })
