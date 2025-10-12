function trimArray(array: string[]): string[] {
  // Remove excess whitespace and newline strings from the beginning
  while (array.length > 0 && /^\s*$/.test(array[0])) {
    array.shift()
  }

  // Remove excess whitespace and newline strings from the end
  while (array.length > 0 && /^\s*$/.test(array[array.length - 1])) {
    array.pop()
  }

  // Collapse consecutive empty lines into single empty lines
  for (let index = array.length - 1; index > 0; index--) {
    if (array[index].length === 0 && array[index - 1].length === 0) {
      array.splice(index, 1)
    }
  }

  return array
}

export const trimLines = (value: string): string => trimArray(value.split(/\r?\n/)).join('\n')
