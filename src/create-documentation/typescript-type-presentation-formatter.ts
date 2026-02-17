const DEFAULT_CONTINUATION_INDENT = 2
const DEFAULT_DEPTH_WEIGHT = 1
const DEFAULT_MAX_FRONTIER_SIZE = 256
const DEFAULT_OVERFLOW_TOLERANCE = 4
const DEFAULT_PRINT_WIDTH = 100
const PLACEHOLDER_END = '\uE001'
const PLACEHOLDER_START = '\uE000'

export type BreakKind = 'ampersand' | 'arrow' | 'colon' | 'comma' | 'extends' | 'pipe' | 'question'

export interface TypeScriptTypePresentationFormatterOptions {
  breakWeights?: Partial<Record<BreakKind, number>>
  computationWidth?: number
  continuationIndent?: number
  depthWeight?: number
  overflowTolerance?: number
  printWidth?: number
}

interface BreakCandidate {
  anchorIndent: number
  depth: number
  kind: BreakKind
  offset: number
}

interface FormatConfig {
  breakWeights: Record<BreakKind, number>
  computationWidth: number
  continuationIndent: number
  depthWeight: number
  overflowTolerance: number
  printWidth: number
}

interface FormatState {
  breakPenalty: number
  breaks: number[]
  column: number
  cursor: number
  lineCount: number
  overflow2: number
  tainted: boolean
}

type TerminalState = { terminalOverflow2: number } & FormatState

interface ScanResult {
  analysisSafe: boolean
  depthAtOffset: number[]
  protectedMask: boolean[]
}

const DEFAULT_BREAK_WEIGHTS: Record<BreakKind, number> = {
  ampersand: 1,
  arrow: 3,
  colon: 4,
  comma: 2,
  extends: 5,
  pipe: 1,
  question: 4,
}

export function formatTypeScriptTypePresentation(
  source: string,
  options: TypeScriptTypePresentationFormatterOptions = {},
): string {
  const config = resolveConfig(options)
  const firstPass = formatTypeScriptTypePresentationInternal(source, config)
  const secondPass = formatTypeScriptTypePresentationInternal(firstPass, config)

  return secondPass
}

export function normalizeExcerptBoundaryIndentation(source: string): string {
  const normalizedNewlines = source.replace(/\r\n?/g, '\n')
  const lines = normalizedNewlines.split('\n')

  while (lines.length > 0 && lines[0].trim().length === 0) {
    lines.shift()
  }

  while (lines.length > 0 && lines.at(-1)?.trim().length === 0) {
    lines.pop()
  }

  const compacted = lines.filter((line) => line.trim().length > 0)

  if (compacted.length === 0) {
    return ''
  }

  compacted[0] = trimLeadingIndent(compacted[0])
  const lastIndex = compacted.length - 1
  compacted[lastIndex] = compacted[lastIndex].replace(/[ \t]+$/g, '')

  if (compacted.length < 2) {
    return compacted.join('\n')
  }

  const nonFirstIndexes = [...Array.from({ length: compacted.length - 1 }, (_, index) => index + 1)]
  const baselineIndexes =
    compacted.length > 2
      ? [...Array.from({ length: compacted.length - 2 }, (_, index) => index + 1)]
      : nonFirstIndexes

  const minIndentation = Math.min(
    ...baselineIndexes
      .map((index) => indentationWidth(compacted[index]))
      .filter((indentation) => indentation !== undefined),
  )

  const dedentBy =
    Number.isFinite(minIndentation) && minIndentation > DEFAULT_CONTINUATION_INDENT
      ? minIndentation - DEFAULT_CONTINUATION_INDENT
      : 0

  if (dedentBy > 0) {
    for (const index of nonFirstIndexes) {
      if (compacted[index].trim().length === 0) {
        continue
      }

      compacted[index] = removeLeadingIndent(compacted[index], dedentBy)
    }
  }

  return compacted.join('\n')
}

function formatTypeScriptTypePresentationInternal(source: string, config: FormatConfig): string {
  const phase1 = normalizeExcerptBoundaryIndentation(source)
  if (phase1.length === 0) {
    return phase1
  }

  const phase1Scan = scanProtectedRegionsAndDepth(phase1)
  if (!phase1Scan.analysisSafe) {
    return stripTrailingWhitespacePerLine(phase1)
  }

  const phase1Normalized = normalizeInlineSpacing(phase1, phase1Scan.protectedMask)
  const scan = scanProtectedRegionsAndDepth(phase1Normalized)

  if (!scan.analysisSafe) {
    return stripTrailingWhitespacePerLine(phase1)
  }

  const candidates = extractBreakCandidates(phase1Normalized, scan)
  if (candidates.length === 0) {
    return stripTrailingWhitespacePerLine(phase1Normalized)
  }

  const terminalStates = planBreaks(phase1Normalized, candidates, config)
  if (terminalStates.length === 0) {
    return stripTrailingWhitespacePerLine(phase1Normalized)
  }

  const selected = pickTerminalState(terminalStates)
  if (selected === undefined) {
    return stripTrailingWhitespacePerLine(phase1Normalized)
  }

  return renderWithBreakPlan({
    candidates,
    continuationIndent: config.continuationIndent,
    selectedBreakIndexes: new Set(selected.breaks),
    source: phase1Normalized,
  })
}

function resolveConfig(options: TypeScriptTypePresentationFormatterOptions): FormatConfig {
  const printWidth = options.printWidth ?? DEFAULT_PRINT_WIDTH
  const defaultComputationWidth = Math.max(printWidth + 24, Math.floor(printWidth * 1.5))

  return {
    breakWeights: {
      ...DEFAULT_BREAK_WEIGHTS,
      ...options.breakWeights,
    },
    computationWidth: options.computationWidth ?? defaultComputationWidth,
    continuationIndent: options.continuationIndent ?? DEFAULT_CONTINUATION_INDENT,
    depthWeight: options.depthWeight ?? DEFAULT_DEPTH_WEIGHT,
    overflowTolerance: options.overflowTolerance ?? DEFAULT_OVERFLOW_TOLERANCE,
    printWidth,
  }
}

function indentationWidth(line: string): number | undefined {
  if (line.trim().length === 0) {
    return undefined
  }

  let width = 0

  while (width < line.length) {
    const char = line[width]

    if (char !== ' ' && char !== '\t') {
      break
    }

    width += 1
  }

  return width
}

function removeLeadingIndent(line: string, count: number): string {
  if (count <= 0 || line.length === 0) {
    return line
  }

  let removed = 0
  let index = 0

  while (index < line.length && removed < count) {
    const char = line[index]

    if (char !== ' ' && char !== '\t') {
      break
    }

    index += 1
    removed += 1
  }

  return line.slice(index)
}

function trimLeadingIndent(line: string): string {
  return line.replace(/^[ \t]+/g, '')
}

function normalizeInlineSpacing(source: string, protectedMask: boolean[]): string {
  let normalized = ''
  let previousWasInlineSpace = false
  let startOfLine = true

  for (let offset = 0; offset < source.length; offset++) {
    const char = source[offset]

    if (char === '\n') {
      normalized += char
      previousWasInlineSpace = false
      startOfLine = true
      continue
    }

    if (!protectedMask[offset] && (char === ' ' || char === '\t')) {
      if (startOfLine) {
        normalized += char
        continue
      }

      if (previousWasInlineSpace) {
        continue
      }

      normalized += ' '
      previousWasInlineSpace = true
      continue
    }

    normalized += char
    previousWasInlineSpace = false
    startOfLine = false
  }

  return normalized
}

function scanProtectedRegionsAndDepth(source: string): ScanResult {
  const depthAtOffset = Array<number>(source.length).fill(0)
  const protectedMask = Array<boolean>(source.length).fill(false)
  const bracketStack: string[] = []

  let depth = 0
  let offset = 0

  while (offset < source.length) {
    const char = source[offset]
    depthAtOffset[offset] = depth

    if (char === PLACEHOLDER_START) {
      const end = source.indexOf(PLACEHOLDER_END, offset + 1)
      if (end < 0) {
        return {
          analysisSafe: false,
          depthAtOffset,
          protectedMask,
        }
      }

      markProtectedSpan({
        depth,
        depthAtOffset,
        end: end + 1,
        protectedMask,
        start: offset,
      })

      offset = end + 1
      continue
    }

    if (char === "'" || char === '"') {
      const end = scanQuotedLiteral(source, offset, char)
      if (end < 0) {
        return {
          analysisSafe: false,
          depthAtOffset,
          protectedMask,
        }
      }

      markProtectedSpan({
        depth,
        depthAtOffset,
        end: end + 1,
        protectedMask,
        start: offset,
      })

      offset = end + 1
      continue
    }

    if (char === '`') {
      const end = scanTemplateLiteral(source, offset)
      if (end < 0) {
        return {
          analysisSafe: false,
          depthAtOffset,
          protectedMask,
        }
      }

      markProtectedSpan({
        depth,
        depthAtOffset,
        end: end + 1,
        protectedMask,
        start: offset,
      })

      offset = end + 1
      continue
    }

    if (source.startsWith('=>', offset)) {
      depthAtOffset[offset] = depth

      if (offset + 1 < source.length) {
        depthAtOffset[offset + 1] = depth
      }

      offset += 2
      continue
    }

    if (isOpeningBracket(char)) {
      bracketStack.push(char)
      depth += 1
      offset += 1
      continue
    }

    if (isClosingBracket(char)) {
      const top = bracketStack.at(-1)
      if (top === undefined || top !== matchingOpeningBracket(char)) {
        return {
          analysisSafe: false,
          depthAtOffset,
          protectedMask,
        }
      }

      bracketStack.pop()
      depth = Math.max(0, depth - 1)
      offset += 1
      continue
    }

    offset += 1
  }

  return {
    analysisSafe: bracketStack.length === 0,
    depthAtOffset,
    protectedMask,
  }
}

function markProtectedSpan(options: {
  depth: number
  depthAtOffset: number[]
  end: number
  protectedMask: boolean[]
  start: number
}): void {
  for (let offset = options.start; offset < options.end; offset++) {
    options.protectedMask[offset] = true
    options.depthAtOffset[offset] = options.depth
  }
}

function scanQuotedLiteral(source: string, start: number, quote: '"' | "'"): number {
  let offset = start + 1

  while (offset < source.length) {
    if (source[offset] === '\\') {
      offset += 2
      continue
    }

    if (source[offset] === quote) {
      return offset
    }

    offset += 1
  }

  return -1
}

function scanTemplateLiteral(source: string, start: number): number {
  let offset = start + 1

  while (offset < source.length) {
    if (source[offset] === '\\') {
      offset += 2
      continue
    }

    if (source[offset] === '`') {
      return offset
    }

    offset += 1
  }

  return -1
}

function isOpeningBracket(char: string): boolean {
  return char === '(' || char === '[' || char === '{' || char === '<'
}

function isClosingBracket(char: string): boolean {
  return char === ')' || char === ']' || char === '}' || char === '>'
}

function matchingOpeningBracket(char: string): string {
  if (char === ')') {
    return '('
  }

  if (char === ']') {
    return '['
  }

  if (char === '}') {
    return '{'
  }

  return '<'
}

function extractBreakCandidates(source: string, scan: ScanResult): BreakCandidate[] {
  const candidates: BreakCandidate[] = []
  const conditionalQuestionDepths: number[] = []

  let offset = 0

  while (offset < source.length) {
    if (scan.protectedMask[offset]) {
      offset += 1
      continue
    }

    const depth = scan.depthAtOffset[offset]
    const anchorIndent = lineIndentationAt(source, offset)

    if (source.startsWith('=>', offset) && !scan.protectedMask[offset + 1]) {
      if (isBreakBeforeOffsetAllowed(source, offset)) {
        candidates.push({
          anchorIndent,
          depth,
          kind: 'arrow',
          offset,
        })
      }

      offset += 2
      continue
    }

    if (startsWithWord(source, offset, 'extends') && isBreakBeforeOffsetAllowed(source, offset)) {
      candidates.push({
        anchorIndent,
        depth,
        kind: 'extends',
        offset,
      })

      offset += 'extends'.length
      continue
    }

    const char = source[offset]

    if ((char === '|' || char === '&') && isBreakBeforeOffsetAllowed(source, offset)) {
      candidates.push({
        anchorIndent,
        depth,
        kind: char === '|' ? 'pipe' : 'ampersand',
        offset,
      })

      offset += 1
      continue
    }

    if (char === ',' && isBreakAfterOffsetAllowed(source, offset + 1)) {
      candidates.push({
        anchorIndent,
        depth,
        kind: 'comma',
        offset: offset + 1,
      })

      offset += 1
      continue
    }

    if (char === '?') {
      const nextNonWhitespace = findNextNonWhitespace(source, offset + 1)
      const isOptionalMarker = nextNonWhitespace !== undefined && source[nextNonWhitespace] === ':'

      if (!isOptionalMarker && isBreakBeforeOffsetAllowed(source, offset)) {
        candidates.push({
          anchorIndent,
          depth,
          kind: 'question',
          offset,
        })

        conditionalQuestionDepths.push(depth)
      }

      offset += 1
      continue
    }

    if (char === ':') {
      const top = conditionalQuestionDepths.at(-1)
      if (top !== undefined && top === depth && isBreakBeforeOffsetAllowed(source, offset)) {
        candidates.push({
          anchorIndent,
          depth,
          kind: 'colon',
          offset,
        })

        conditionalQuestionDepths.pop()
      }

      offset += 1
      continue
    }

    offset += 1
  }

  return dedupeCandidates(candidates)
}

function dedupeCandidates(candidates: BreakCandidate[]): BreakCandidate[] {
  const deduped: BreakCandidate[] = []
  const seenOffsets = new Set<number>()

  for (const candidate of candidates) {
    if (seenOffsets.has(candidate.offset)) {
      continue
    }

    seenOffsets.add(candidate.offset)
    deduped.push(candidate)
  }

  return deduped
}

function startsWithWord(source: string, offset: number, word: string): boolean {
  if (!source.startsWith(word, offset)) {
    return false
  }

  const previous = source[offset - 1]
  const next = source[offset + word.length]

  return !isIdentifierCharacter(previous) && !isIdentifierCharacter(next)
}

function isIdentifierCharacter(char: string | undefined): boolean {
  if (char === undefined) {
    return false
  }

  return /[\w$]/.test(char)
}

function isBreakBeforeOffsetAllowed(source: string, offset: number): boolean {
  if (offset <= 0 || offset >= source.length) {
    return false
  }

  const lineStart = source.lastIndexOf('\n', offset - 1) + 1
  const leading = source.slice(lineStart, offset)

  if (leading.trim().length === 0) {
    return false
  }

  const previousNonWhitespace = findPreviousNonWhitespace(source, offset - 1)
  if (previousNonWhitespace === undefined) {
    return false
  }

  return source[previousNonWhitespace] !== '\n'
}

function isBreakAfterOffsetAllowed(source: string, offset: number): boolean {
  if (offset <= 0 || offset > source.length) {
    return false
  }

  const nextNonWhitespace = findNextNonWhitespace(source, offset)
  if (nextNonWhitespace === undefined) {
    return false
  }

  const between = source.slice(offset, nextNonWhitespace)

  return !between.includes('\n')
}

function findNextNonWhitespace(source: string, offset: number): number | undefined {
  for (let index = offset; index < source.length; index++) {
    if (source[index] !== ' ' && source[index] !== '\t' && source[index] !== '\n') {
      return index
    }
  }

  return undefined
}

function findPreviousNonWhitespace(source: string, offset: number): number | undefined {
  for (let index = offset; index >= 0; index--) {
    if (source[index] !== ' ' && source[index] !== '\t' && source[index] !== '\n') {
      return index
    }
  }

  return undefined
}

function lineIndentationAt(source: string, offset: number): number {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1
  let indentation = 0

  for (let index = lineStart; index < source.length; index++) {
    if (source[index] !== ' ') {
      break
    }

    indentation += 1
  }

  return indentation
}

function planBreaks(
  source: string,
  candidates: BreakCandidate[],
  config: FormatConfig,
): TerminalState[] {
  let frontier: FormatState[] = [
    {
      breakPenalty: 0,
      breaks: [],
      column: 0,
      cursor: 0,
      lineCount: 0,
      overflow2: 0,
      tainted: false,
    },
  ]

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
    const candidate = candidates[candidateIndex]
    const nextFrontier: FormatState[] = []

    for (const state of frontier) {
      const advanced = consumeChunk(state, source, state.cursor, candidate.offset, config)

      nextFrontier.push({
        ...advanced,
        cursor: candidate.offset,
      })

      const trailedWhitespace = trailingWhitespaceCount(source, candidate.offset)
      const lineLengthBeforeBreak = Math.max(0, advanced.column - trailedWhitespace)
      const breakIndentation = Math.max(0, candidate.anchorIndent + config.continuationIndent)

      nextFrontier.push({
        breakPenalty:
          advanced.breakPenalty +
          config.breakWeights[candidate.kind] +
          config.depthWeight * candidate.depth,
        breaks: [...advanced.breaks, candidateIndex],
        column: breakIndentation,
        cursor: skipInlineWhitespace(source, candidate.offset),
        lineCount: advanced.lineCount + 1,
        overflow2:
          advanced.overflow2 +
          overflowSquare({
            lineLength: lineLengthBeforeBreak,
            overflowTolerance: config.overflowTolerance,
            printWidth: config.printWidth,
          }),
        tainted: advanced.tainted || breakIndentation > config.computationWidth,
      })
    }

    frontier = pruneFrontier(nextFrontier)

    if (frontier.length > DEFAULT_MAX_FRONTIER_SIZE) {
      frontier = frontier.toSorted(compareStatesForPruning).slice(0, DEFAULT_MAX_FRONTIER_SIZE)
    }
  }

  return frontier
    .map((state) => consumeChunk(state, source, state.cursor, source.length, config))
    .map((state) => ({
      ...state,
      terminalOverflow2:
        state.overflow2 +
        overflowSquare({
          lineLength: state.column,
          overflowTolerance: config.overflowTolerance,
          printWidth: config.printWidth,
        }),
    }))
}

function consumeChunk(
  state: FormatState,
  source: string,
  start: number,
  end: number,
  config: FormatConfig,
): FormatState {
  let column = state.column
  let overflow2 = state.overflow2
  let tainted = state.tainted

  for (let offset = start; offset < end; offset++) {
    const char = source[offset]

    if (char === '\n') {
      overflow2 += overflowSquare({
        lineLength: column,
        overflowTolerance: config.overflowTolerance,
        printWidth: config.printWidth,
      })
      column = 0
      continue
    }

    column += 1

    if (column > config.computationWidth) {
      tainted = true
    }
  }

  return {
    ...state,
    column,
    cursor: end,
    overflow2,
    tainted,
  }
}

function overflowSquare(options: {
  lineLength: number
  overflowTolerance: number
  printWidth: number
}): number {
  const effectiveWidth = options.printWidth + Math.max(0, options.overflowTolerance)
  const overflow = Math.max(0, options.lineLength - effectiveWidth)

  return overflow ** 2
}

function trailingWhitespaceCount(source: string, offset: number): number {
  let count = 0
  let cursor = offset - 1

  while (cursor >= 0) {
    const char = source[cursor]

    if (char === '\n') {
      break
    }

    if (char !== ' ' && char !== '\t') {
      break
    }

    count += 1
    cursor -= 1
  }

  return count
}

function skipInlineWhitespace(source: string, offset: number): number {
  let cursor = offset

  while (cursor < source.length) {
    const char = source[cursor]

    if (char !== ' ' && char !== '\t') {
      break
    }

    cursor += 1
  }

  return cursor
}

function pruneFrontier(states: FormatState[]): FormatState[] {
  const pruned: FormatState[] = []

  for (const candidate of states) {
    let dominated = false

    for (let index = pruned.length - 1; index >= 0; index--) {
      const existing = pruned[index]

      if (dominates(existing, candidate)) {
        dominated = true
        break
      }

      if (dominates(candidate, existing)) {
        pruned.splice(index, 1)
      }
    }

    if (!dominated) {
      pruned.push(candidate)
    }
  }

  return pruned
}

function dominates(left: FormatState, right: FormatState): boolean {
  if (left.tainted !== right.tainted) {
    return false
  }

  const costComparison = compareCostTuple(left, right)

  return costComparison <= 0 && left.column <= right.column && left.cursor >= right.cursor
}

function compareCostTuple(
  left: Pick<FormatState, 'breakPenalty' | 'lineCount' | 'overflow2'>,
  right: Pick<FormatState, 'breakPenalty' | 'lineCount' | 'overflow2'>,
): number {
  if (left.overflow2 !== right.overflow2) {
    return left.overflow2 - right.overflow2
  }

  if (left.breakPenalty !== right.breakPenalty) {
    return left.breakPenalty - right.breakPenalty
  }

  return left.lineCount - right.lineCount
}

function compareStatesForPruning(left: FormatState, right: FormatState): number {
  if (left.tainted !== right.tainted) {
    return left.tainted ? 1 : -1
  }

  const costComparison = compareCostTuple(left, right)
  if (costComparison !== 0) {
    return costComparison
  }

  if (left.column !== right.column) {
    return left.column - right.column
  }

  if (left.cursor !== right.cursor) {
    return right.cursor - left.cursor
  }

  return compareBreakPlans(left.breaks, right.breaks)
}

function pickTerminalState(states: TerminalState[]): TerminalState | undefined {
  const untainted = states.filter((state) => !state.tainted)
  const pool = untainted.length > 0 ? untainted : states.filter((state) => state.tainted)

  if (pool.length === 0) {
    return undefined
  }

  return pool.toSorted(compareTerminalStates)[0]
}

function compareTerminalStates(left: TerminalState, right: TerminalState): number {
  if (left.terminalOverflow2 !== right.terminalOverflow2) {
    return left.terminalOverflow2 - right.terminalOverflow2
  }

  const costComparison = compareCostTuple(left, right)
  if (costComparison !== 0) {
    return costComparison
  }

  if (left.column !== right.column) {
    return left.column - right.column
  }

  return compareBreakPlans(left.breaks, right.breaks)
}

function compareBreakPlans(left: number[], right: number[]): number {
  const minLength = Math.min(left.length, right.length)

  for (let index = 0; index < minLength; index++) {
    if (left[index] !== right[index]) {
      return left[index] - right[index]
    }
  }

  return left.length - right.length
}

function renderWithBreakPlan(options: {
  candidates: BreakCandidate[]
  continuationIndent: number
  selectedBreakIndexes: Set<number>
  source: string
}): string {
  let cursor = 0
  let output = ''

  for (let index = 0; index < options.candidates.length; index++) {
    const candidate = options.candidates[index]

    output += options.source.slice(cursor, candidate.offset)
    cursor = candidate.offset

    if (!options.selectedBreakIndexes.has(index)) {
      continue
    }

    output = output.replace(/[ \t]+$/g, '')

    const indentation = Math.max(0, candidate.anchorIndent + options.continuationIndent)
    output += `\n${' '.repeat(indentation)}`
    cursor = skipInlineWhitespace(options.source, cursor)
  }

  output += options.source.slice(cursor)

  return stripTrailingWhitespacePerLine(output)
}

function stripTrailingWhitespacePerLine(value: string): string {
  return value.replace(/[ \t]+$/gm, '')
}
