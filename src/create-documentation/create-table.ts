import type { PhrasingContent, Root, RootContent, Table, TableCell, TableRow } from 'mdast'
import { squeezeParagraphs } from 'mdast-squeeze-paragraphs'
import { findAndReplace } from 'mdast-util-find-and-replace'
import { phrasing as isPhrasingContent } from 'mdast-util-phrasing'
import { isEmpty } from './is-empty'

/**
 * Removes empty rows and columns from a markdown table.
 *
 * @param table - Table node to filter
 * @returns Table with empty rows and columns removed, or undefined if no data rows remain
 *
 * @remarks
 * Empty rows are those where all cells contain no phrasing content.
 * Empty columns are those where all cells across all data rows contain no phrasing content.
 * When a column is removed, the corresponding header cell is also removed.
 * Returns undefined if all data rows are empty.
 */
export function removeEmptyTableData(table: Table): Table | undefined {
  if (table.children.length === 0) {
    return undefined
  }

  const [headerRow, ...dataRows] = table.children

  if (dataRows.length === 0) {
    return undefined
  }

  // Filter out completely empty rows
  const nonEmptyRows = dataRows.filter((row) => !isEmpty(row))

  if (nonEmptyRows.length === 0) {
    return undefined
  }

  // Identify empty columns
  const columnCount = headerRow.children.length
  const emptyColumns = new Set<number>()

  for (let colIndex = 0; colIndex < columnCount; colIndex++) {
    const isColumnEmpty = nonEmptyRows.every((row) => isEmpty(row.children[colIndex]))
    if (isColumnEmpty) {
      emptyColumns.add(colIndex)
    }
  }

  // If no empty columns, return table with filtered rows
  if (emptyColumns.size === 0) {
    return {
      ...table,
      children: [headerRow, ...nonEmptyRows],
    }
  }

  // Filter out empty columns from header and rows
  const filteredHeaderRow: TableRow = {
    ...headerRow,
    children: headerRow.children.filter((_, index) => !emptyColumns.has(index)),
  }

  const filteredDataRows = nonEmptyRows.map(
    (row): TableRow => ({
      ...row,
      children: row.children.filter((_, index) => !emptyColumns.has(index)),
    }),
  )

  const filteredAlign = table.align?.filter((_, index) => !emptyColumns.has(index))

  const result: Table = {
    ...table,
    align: filteredAlign,
    children: [filteredHeaderRow, ...filteredDataRows],
  }

  if (isEmpty(result)) {
    return undefined
  }

  return result
}

/**
 * Creates a markdown table from headers and row data.
 *
 * @param headers - Column header labels
 * @param rows - Table data rows where each cell contains markdown content or undefined
 * @returns Table node or undefined if no rows remain after filtering empty data
 *
 * @remarks
 * Cells are converted to table cells with proper handling of paragraphs, phrasing content,
 * and line breaks. Empty rows and columns are automatically removed. Returns undefined if
 * no data rows remain after filtering.
 */
export function createTable(
  headers: string[],
  rows: Array<Array<RootContent[] | undefined>>,
): Table | undefined {
  if (rows.length === 0) {
    return undefined
  }

  const createTableCell = (rootContent: RootContent[] = []): TableCell => {
    const tree: Root = { children: rootContent, type: 'root' }
    squeezeParagraphs(tree)
    findAndReplace(tree, [/\r?\n|\\r/g, () => ({ type: 'html', value: '<br>' })])

    const children: PhrasingContent[] = []

    for (let index = 0; index < tree.children.length; index++) {
      const node = tree.children[index]

      if (node.type === 'paragraph') {
        children.push(...node.children)

        if (index < tree.children.length - 1) {
          children.push({ type: 'html', value: '<br><br>' })
        }
      } else if (isPhrasingContent(node) || node.type === 'html') {
        children.push(node)
      }
    }

    return {
      children,
      type: 'tableCell',
    }
  }

  const headerRow: TableRow = {
    children: headers.map((value) => createTableCell([{ type: 'text', value }])),
    type: 'tableRow',
  }

  const dataRows: TableRow[] = rows.map((row) => ({
    children: row.map((value) => createTableCell(value)),
    type: 'tableRow',
  }))

  const table: Table = {
    align: headers.map(() => null),
    children: [headerRow, ...dataRows],
    type: 'table',
  }

  return removeEmptyTableData(table)
}
