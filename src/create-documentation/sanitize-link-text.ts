export function sanitizeLinkText(text: string): string {
  return text
    .replace(/\\/g, '\\\\') // first replace the escape character
    .replace(/[*#[\]_|`~]/g, (x) => '\\' + x) // then escape any special characters
    .replace(/---/g, '\\-\\-\\-') // hyphens only if it's 3 or more
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\s+/g, ' ')
}
