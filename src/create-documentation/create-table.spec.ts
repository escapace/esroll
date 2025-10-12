import type { RootContent, Table, TableCell, TableRow } from 'mdast'
import { describe, expect, it } from 'vitest'
import { createTable, removeEmptyTableData } from './create-table'

function createTableCell(content: string): TableCell {
  return {
    children: [{ type: 'text', value: content }],
    type: 'tableCell',
  }
}

function createEmptyTableCell(): TableCell {
  return {
    children: [],
    type: 'tableCell',
  }
}

function buildTable(headers: string[], dataRows: Array<Array<string | null>>): Table {
  const headerRow: TableRow = {
    children: headers.map(createTableCell),
    type: 'tableRow',
  }

  const rows: TableRow[] = dataRows.map((row) => ({
    children: row.map((cell) => (cell === null ? createEmptyTableCell() : createTableCell(cell))),
    type: 'tableRow',
  }))

  return {
    align: headers.map(() => null),
    children: [headerRow, ...rows],
    type: 'table',
  }
}

describe('removeEmptyTableData', () => {
  describe('empty row removal', () => {
    it('removes completely empty rows', () => {
      const table = buildTable(
        ['Col1', 'Col2', 'Col3'],
        [
          ['A1', 'A2', 'A3'],
          [null, null, null],
          ['C1', 'C2', 'C3'],
        ],
      )

      const result = removeEmptyTableData(table)

      expect(result).toBeDefined()
      expect(result!.children).toHaveLength(3)
    })

    it('returns undefined when all rows are empty', () => {
      const table = buildTable(
        ['Col1', 'Col2'],
        [
          [null, null],
          [null, null],
        ],
      )

      const result = removeEmptyTableData(table)

      expect(result).toBeUndefined()
    })
  })

  describe('empty column removal', () => {
    it('removes completely empty columns and their headers', () => {
      const table = buildTable(
        ['Col1', 'Col2', 'Col3'],
        [
          ['A1', null, 'A3'],
          ['B1', null, 'B3'],
          ['C1', null, 'C3'],
        ],
      )

      const result = removeEmptyTableData(table)

      expect(result).toBeDefined()
      expect(result!.children[0].children).toHaveLength(2)
      expect(result!.align).toHaveLength(2)
    })

    it('removes middle column and its associated header', () => {
      const table = buildTable(
        ['Header1', 'Header2', 'Header3'],
        [
          ['A1', null, 'A3'],
          ['B1', null, 'B3'],
          ['C1', null, 'C3'],
        ],
      )

      const result = removeEmptyTableData(table)

      expect(result).toBeDefined()
      expect(result!.children[0].children).toHaveLength(2)
      expect(result!.align).toHaveLength(2)
      expect(result!.children[0].children[0].children[0]).toMatchObject({
        type: 'text',
        value: 'Header1',
      })
      expect(result!.children[0].children[1].children[0]).toMatchObject({
        type: 'text',
        value: 'Header3',
      })
      expect(result!.children[1].children[0].children[0]).toMatchObject({
        type: 'text',
        value: 'A1',
      })
      expect(result!.children[1].children[1].children[0]).toMatchObject({
        type: 'text',
        value: 'A3',
      })
    })

    it('removes multiple empty columns', () => {
      const table = buildTable(
        ['Col1', 'Col2', 'Col3', 'Col4'],
        [
          ['A1', null, null, 'A4'],
          ['B1', null, null, 'B4'],
        ],
      )

      const result = removeEmptyTableData(table)

      expect(result).toBeDefined()
      expect(result!.children[0].children).toHaveLength(2)
    })

    it('removes first column when empty', () => {
      const table = buildTable(
        ['Col1', 'Col2', 'Col3'],
        [
          [null, 'A2', 'A3'],
          [null, 'B2', 'B3'],
        ],
      )

      const result = removeEmptyTableData(table)

      expect(result).toBeDefined()
      expect(result!.children[0].children).toHaveLength(2)
    })

    it('removes last column when empty', () => {
      const table = buildTable(
        ['Col1', 'Col2', 'Col3'],
        [
          ['A1', 'A2', null],
          ['B1', 'B2', null],
        ],
      )

      const result = removeEmptyTableData(table)

      expect(result).toBeDefined()
      expect(result!.children[0].children).toHaveLength(2)
    })
  })

  describe('combined removal', () => {
    it('removes both empty rows and empty columns', () => {
      const table = buildTable(
        ['Col1', 'Col2', 'Col3'],
        [
          ['A1', null, 'A3'],
          [null, null, null],
          ['C1', null, 'C3'],
        ],
      )

      const result = removeEmptyTableData(table)

      expect(result).toBeDefined()
      expect(result!.children).toHaveLength(3)
      expect(result!.children[0].children).toHaveLength(2)
    })

    it('processes rows before checking columns', () => {
      const table = buildTable(
        ['Col1', 'Col2'],
        [
          [null, 'A2'],
          [null, null],
          ['C1', 'C2'],
        ],
      )

      const result = removeEmptyTableData(table)

      expect(result).toBeDefined()
      expect(result!.children).toHaveLength(3)
      expect(result!.children[0].children).toHaveLength(2)
    })
  })

  describe('preservation cases', () => {
    it('preserves partially-filled rows', () => {
      const table = buildTable(
        ['Col1', 'Col2', 'Col3'],
        [
          ['A1', null, null],
          [null, 'B2', null],
          [null, null, 'C3'],
        ],
      )

      const result = removeEmptyTableData(table)

      expect(result).toBeDefined()
      expect(result!.children).toHaveLength(4)
    })

    it('preserves partially-filled columns', () => {
      const table = buildTable(
        ['Col1', 'Col2', 'Col3'],
        [
          ['A1', 'A2', null],
          ['B1', 'B2', 'B3'],
        ],
      )

      const result = removeEmptyTableData(table)

      expect(result).toBeDefined()
      expect(result!.children[0].children).toHaveLength(3)
    })

    it('preserves all data when nothing is empty', () => {
      const table = buildTable(
        ['Col1', 'Col2'],
        [
          ['A1', 'A2'],
          ['B1', 'B2'],
        ],
      )

      const result = removeEmptyTableData(table)

      expect(result).toBeDefined()
      expect(result!.children).toHaveLength(3)
      expect(result!.children[0].children).toHaveLength(2)
    })
  })

  describe('edge cases', () => {
    it('returns undefined when table has no children', () => {
      const table: Table = {
        align: [],
        children: [],
        type: 'table',
      }

      const result = removeEmptyTableData(table)

      expect(result).toBeUndefined()
    })

    it('returns undefined when table has only header row', () => {
      const table: Table = {
        align: [null, null],
        children: [
          {
            children: [createTableCell('Col1'), createTableCell('Col2')],
            type: 'tableRow',
          },
        ],
        type: 'table',
      }

      const result = removeEmptyTableData(table)

      expect(result).toBeUndefined()
    })

    it('handles single row single column', () => {
      const table = buildTable(['Col1'], [['A1']])

      const result = removeEmptyTableData(table)

      expect(result).toBeDefined()
      expect(result!.children).toHaveLength(2)
    })

    it('handles single empty row', () => {
      const table = buildTable(['Col1', 'Col2'], [[null, null]])

      const result = removeEmptyTableData(table)

      expect(result).toBeUndefined()
    })

    it('handles single row with empty column', () => {
      const table = buildTable(['Col1', 'Col2'], [['A1', null]])

      const result = removeEmptyTableData(table)

      expect(result).toBeDefined()
      expect(result!.children[0].children).toHaveLength(1)
    })
  })
})

describe('createTable', () => {
  describe('basic functionality', () => {
    it('creates table with headers and rows', () => {
      const headers = ['Col1', 'Col2']
      const rows: Array<Array<RootContent[] | undefined>> = [
        [[{ type: 'text', value: 'A1' }], [{ type: 'text', value: 'A2' }]],
        [[{ type: 'text', value: 'B1' }], [{ type: 'text', value: 'B2' }]],
      ]

      const result = createTable(headers, rows)

      expect(result).toBeDefined()
      expect(result?.type).toBe('table')
      expect(result?.children).toHaveLength(3)
      expect(result?.children[0].type).toBe('tableRow')
    })

    it('handles undefined cells', () => {
      const headers = ['Col1', 'Col2']
      const rows: Array<Array<RootContent[] | undefined>> = [
        [[{ type: 'text', value: 'A1' }], undefined],
      ]

      const result = createTable(headers, rows)

      expect(result).toBeDefined()
      expect(result?.children).toHaveLength(2)
      expect(result?.children[0].children).toHaveLength(1)
    })

    it('handles mixed content cells', () => {
      const headers = ['Col1', 'Col2']
      const rows: Array<Array<RootContent[] | undefined>> = [
        [
          [{ children: [{ type: 'text', value: 'Paragraph' }], type: 'paragraph' }],
          [{ type: 'inlineCode', value: 'code' }],
        ],
      ]

      const result = createTable(headers, rows)

      expect(result).toBeDefined()
    })

    it('automatically filters empty columns', () => {
      const headers = ['Col1', 'Col2', 'Col3']
      const rows: Array<Array<RootContent[] | undefined>> = [
        [[{ type: 'text', value: 'A1' }], undefined, [{ type: 'text', value: 'A3' }]],
        [[{ type: 'text', value: 'B1' }], undefined, [{ type: 'text', value: 'B3' }]],
      ]

      const result = createTable(headers, rows)

      expect(result).toBeDefined()
      expect(result?.children[0].children).toHaveLength(2)
    })

    it('automatically filters empty rows', () => {
      const headers = ['Col1', 'Col2']
      const rows: Array<Array<RootContent[] | undefined>> = [
        [[{ type: 'text', value: 'A1' }], [{ type: 'text', value: 'A2' }]],
        [undefined, undefined],
        [[{ type: 'text', value: 'C1' }], [{ type: 'text', value: 'C2' }]],
      ]

      const result = createTable(headers, rows)

      expect(result).toBeDefined()
      expect(result?.children).toHaveLength(3)
    })
  })

  describe('empty table handling', () => {
    it('returns undefined when rows are empty', () => {
      const headers = ['Col1', 'Col2']
      const rows: Array<Array<RootContent[] | undefined>> = []

      const result = createTable(headers, rows)

      expect(result).toBeUndefined()
    })

    it('returns undefined when all data rows are empty', () => {
      const headers = ['Col1', 'Col2', 'Col3']
      const rows: Array<Array<RootContent[] | undefined>> = [
        [undefined, undefined, undefined],
        [undefined, undefined, undefined],
      ]

      const result = createTable(headers, rows)

      expect(result).toBeUndefined()
    })
  })

  describe('table structure', () => {
    it('creates header row from headers', () => {
      const headers = ['Header1', 'Header2']
      const rows: Array<Array<RootContent[] | undefined>> = [
        [[{ type: 'text', value: 'Data' }], [{ type: 'text', value: 'Data' }]],
      ]

      const result = createTable(headers, rows)

      expect(result?.children[0].children).toHaveLength(2)
      expect(result?.children[0].children[0].type).toBe('tableCell')
    })

    it('creates data rows from rows', () => {
      const headers = ['Col1', 'Col2']
      const rows: Array<Array<RootContent[] | undefined>> = [
        [[{ type: 'text', value: 'A1' }], [{ type: 'text', value: 'A2' }]],
        [[{ type: 'text', value: 'B1' }], [{ type: 'text', value: 'B2' }]],
      ]

      const result = createTable(headers, rows)

      expect(result?.children).toHaveLength(3)
      expect(result?.children[1].type).toBe('tableRow')
      expect(result?.children[2].type).toBe('tableRow')
    })

    it('sets alignment to null for all columns after filtering', () => {
      const headers = ['Col1', 'Col2', 'Col3']
      const rows: Array<Array<RootContent[] | undefined>> = [
        [
          [{ type: 'text', value: 'A1' }],
          [{ type: 'text', value: 'A2' }],
          [{ type: 'text', value: 'A3' }],
        ],
      ]

      const result = createTable(headers, rows)

      expect(result?.align).toHaveLength(3)
      expect(result?.align?.every((a) => a === null)).toBe(true)
    })
  })
})
