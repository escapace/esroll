export type StringFormatter = (source: string) => string

export type Segment<Opaque> = { kind: 'opaque'; value: Opaque } | { kind: 'text'; value: string }

export interface ProjectionAdapter<S, Opaque, Complement> {
  fromSegments: (options: { complement: Complement; segments: Array<Segment<Opaque>> }) => S
  toSegments: (source: S) => { complement: Complement; segments: Array<Segment<Opaque>> }
}

const PLACEHOLDER_END = '\uE001'
const PLACEHOLDER_START = '\uE000'

interface PlaceholderEntry<Opaque> {
  checksum: string
  id: number
  opaque: Opaque
}

interface Projection<Opaque> {
  entries: Array<PlaceholderEntry<Opaque>>
  prefix: string
  projected: string
}

export class IntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IntegrityError'
  }
}

export function formatWithStringFormatter<S, Opaque, Complement>(options: {
  adapter: ProjectionAdapter<S, Opaque, Complement>
  format: StringFormatter
  source: S
  strict?: boolean
}): S {
  const { adapter, format, source, strict = false } = options

  try {
    const { complement, segments } = adapter.toSegments(source)
    const projection = projectSegments(segments)
    const formatted = format(projection.projected)
    const reconstructedSegments = reconstructSegments(formatted, projection)

    return adapter.fromSegments({
      complement,
      segments: reconstructedSegments,
    })
  } catch (error) {
    if (strict) {
      throw error
    }

    return source
  }
}

function projectSegments<Opaque>(segments: Array<Segment<Opaque>>): Projection<Opaque> {
  const entries: Array<PlaceholderEntry<Opaque>> = []
  let projected = ''

  for (const segment of segments) {
    if (segment.kind === 'text') {
      projected += segment.value
      continue
    }

    const id = entries.length
    const checksum = checksumForOpaque(id, segment.value)

    entries.push({
      checksum,
      id,
      opaque: segment.value,
    })

    projected += toPlaceholder({ checksum, id, prefix: '' })
  }

  const prefix = hashText(`${projected.length}:${entries.length}`)
  if (entries.length === 0) {
    return {
      entries,
      prefix,
      projected,
    }
  }

  projected = projected.replaceAll(
    `${PLACEHOLDER_START}ESR::`,
    `${PLACEHOLDER_START}ESR:${prefix}:`,
  )

  return {
    entries,
    prefix,
    projected,
  }
}

function reconstructSegments<Opaque>(
  formatted: string,
  projection: Projection<Opaque>,
): Array<Segment<Opaque>> {
  const pattern = new RegExp(
    `${PLACEHOLDER_START}ESR:${escapeRegExp(projection.prefix)}:(\\d+):([0-9a-f]+)${PLACEHOLDER_END}`,
    'g',
  )

  const reconstructed: Array<Segment<Opaque>> = []
  const seen = new Set<number>()
  let cursor = 0
  let expectedId = 0

  for (const match of formatted.matchAll(pattern)) {
    const index = match.index
    if (index === undefined) {
      continue
    }

    if (index > cursor) {
      reconstructed.push({
        kind: 'text',
        value: formatted.slice(cursor, index),
      })
    }

    const checksum = match[2]
    const id = Number(match[1])

    const entry = projection.entries[id]
    if (entry === undefined) {
      throw new IntegrityError(`Unknown placeholder id: ${id}`)
    }

    if (seen.has(id)) {
      throw new IntegrityError(`Duplicate placeholder id: ${id}`)
    }

    if (id !== expectedId) {
      throw new IntegrityError(`Placeholder order mismatch at id: ${id}`)
    }

    if (entry.checksum !== checksum) {
      throw new IntegrityError(`Checksum mismatch for placeholder id: ${id}`)
    }

    seen.add(id)
    expectedId += 1

    reconstructed.push({
      kind: 'opaque',
      value: entry.opaque,
    })

    cursor = index + match[0].length
  }

  if (cursor < formatted.length) {
    reconstructed.push({
      kind: 'text',
      value: formatted.slice(cursor),
    })
  }

  if (seen.size !== projection.entries.length) {
    throw new IntegrityError(
      `Missing placeholders: expected ${projection.entries.length}, found ${seen.size}`,
    )
  }

  return normalizeSegments(reconstructed)
}

function normalizeSegments<Opaque>(segments: Array<Segment<Opaque>>): Array<Segment<Opaque>> {
  const normalized: Array<Segment<Opaque>> = []

  for (const segment of segments) {
    if (segment.kind === 'text') {
      if (segment.value.length === 0) {
        continue
      }

      const previous = normalized.at(-1)
      if (previous?.kind === 'text') {
        previous.value += segment.value
      } else {
        normalized.push({
          kind: 'text',
          value: segment.value,
        })
      }

      continue
    }

    normalized.push(segment)
  }

  return normalized
}

function toPlaceholder(options: { checksum: string; id: number; prefix: string }): string {
  return `${PLACEHOLDER_START}ESR:${options.prefix}:${options.id}:${options.checksum}${PLACEHOLDER_END}`
}

function checksumForOpaque<Opaque>(id: number, opaque: Opaque): string {
  const serialized = stableSerialize(opaque)
  return hashText(`${id}:${serialized}`)
}

function stableSerialize(value: unknown): string {
  return stableSerializeInternal(value, new WeakSet<object>())
}

function stableSerializeInternal(value: unknown, visited: WeakSet<object>): string {
  if (value === null || value === undefined) {
    return String(value)
  }

  if (typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (visited.has(value)) {
    return '"[circular]"'
  }

  visited.add(value)

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerializeInternal(entry, visited)).join(',')}]`
  }

  const keys = Object.keys(value as Record<string, unknown>).sort()

  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableSerializeInternal((value as Record<string, unknown>)[key], visited)}`,
    )
    .join(',')}}`
}

function hashText(value: string): string {
  let hash = 2_166_136_261

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }

  return (hash >>> 0).toString(16)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
