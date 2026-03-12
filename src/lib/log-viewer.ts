export type LogSeverity =
  | 'fatal'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'trace'
  | 'unknown'

export type ParsedLogValue = Record<string, {}> | {}[]

export type LogEntry = {
  id: number
  startLine: number
  endLine: number
  raw: string
  preview: string
  summary: string
  severity: LogSeverity
  timestamp: string | null
  source: string | null
  event: string | null
  kind: 'json' | 'text'
  parsed: ParsedLogValue | null
}

export type ParsedLogFile = {
  entries: LogEntry[]
  lineCount: number
  structuredCount: number
}

const TIMESTAMP_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}[tT ][\d:.+-Zz]+\b/,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b/,
  /\b[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\b/,
]

const CONTINUATION_PATTERNS = [
  /^\s+/,
  /^at\s+/,
  /^Caused by:/,
  /^Traceback\b/,
  /^\.\.\. \d+ more$/,
  /^[}\])],?$/,
  /^["'][^"']*["']\s*:/,
]

const SEVERITY_PATTERNS: Array<[LogSeverity, RegExp]> = [
  ['fatal', /\b(fatal|panic|critical)\b/i],
  ['error', /\b(error|err|exception|failed|failure)\b/i],
  ['warn', /\b(warn|warning)\b/i],
  ['info', /\b(info|notice)\b/i],
  ['debug', /\b(debug)\b/i],
  ['trace', /\b(trace)\b/i],
]

const TIMESTAMP_PATHS = [
  'logged_at',
  'timestamp',
  '@timestamp',
  'time',
  'occurred_at',
  'event_ts',
  'ts',
  'created_at',
]

const SOURCE_PATHS = [
  'source',
  'payload.source',
  'normalized_event.source',
  'record.source',
  'logger',
  'service',
]

const EVENT_PATHS = [
  'event',
  'type',
  'message',
  'msg',
  'payload.type',
  'payload.event.type',
  'record.message',
]

const SUMMARY_PATHS = [
  'message',
  'msg',
  'event',
  'payload.event.text',
  'payload.target.data.text',
  'payload.previous_message.text',
  'payload.final_output.memory_summary',
  'payload.final_output.reason',
  'payload.first_pass_output.reason',
  'payload.normalized_event.message_text',
  'error',
]

export function parseLogText(text: string): ParsedLogFile {
  const rawLines = text.split(/\r?\n/)
  const hasTrailingNewline = text.endsWith('\n') || text.endsWith('\r')
  const lines = hasTrailingNewline ? rawLines.slice(0, -1) : rawLines
  const entries: LogEntry[] = []

  let currentLines: string[] = []
  let currentStartLine = 1

  const flush = (endLine: number) => {
    if (!currentLines.length) {
      return
    }

    const raw = currentLines.join('\n')
    entries.push(buildEntry(entries.length + 1, currentStartLine, endLine, raw))
    currentLines = []
  }

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1

    if (!currentLines.length) {
      if (line.trim() === '') {
        continue
      }

      currentStartLine = lineNumber
      currentLines = [line]
      continue
    }

    if (shouldStartNewEntry(line, currentLines[0] ?? '')) {
      flush(lineNumber - 1)
      currentStartLine = lineNumber
      currentLines = [line]
      continue
    }

    currentLines.push(line)
  }

  flush(lines.length)

  const structuredCount = entries.filter(
    (entry) => entry.kind === 'json',
  ).length

  return {
    entries,
    lineCount: lines.length,
    structuredCount,
  }
}

export function prettyPrintEntry(entry: LogEntry): string {
  if (entry.kind === 'json' && entry.parsed !== null) {
    return JSON.stringify(entry.parsed, null, 2)
  }

  return entry.raw
}

function buildEntry(
  id: number,
  startLine: number,
  endLine: number,
  raw: string,
): LogEntry {
  const parsed = parseStructuredValue(raw)
  const severity = inferSeverity(raw, parsed)
  const timestamp =
    firstString(parsed, TIMESTAMP_PATHS) ??
    matchPattern(raw, TIMESTAMP_PATTERNS)
  const source = firstString(parsed, SOURCE_PATHS) ?? null
  const event = firstString(parsed, EVENT_PATHS) ?? null
  const summary = buildSummary(raw, parsed, event)
  const preview = summary.length > 240 ? `${summary.slice(0, 237)}...` : summary

  return {
    id,
    startLine,
    endLine,
    raw,
    preview,
    summary,
    severity,
    timestamp,
    source,
    event,
    kind: parsed === null ? 'text' : 'json',
    parsed,
  }
}

function shouldStartNewEntry(
  line: string,
  firstLineOfCurrentEntry: string,
): boolean {
  const trimmed = line.trim()

  if (trimmed === '') {
    return false
  }

  if (
    CONTINUATION_PATTERNS.some(
      (pattern) => pattern.test(trimmed) || pattern.test(line),
    )
  ) {
    return false
  }

  if (
    firstLineOfCurrentEntry.trim().startsWith('{') &&
    !trimmed.startsWith('{')
  ) {
    return false
  }

  return true
}

function parseStructuredValue(raw: string): ParsedLogValue | null {
  const trimmed = raw.trim()

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null
  }

  try {
    return JSON.parse(trimmed) as ParsedLogValue
  } catch {
    return null
  }
}

function inferSeverity(raw: string, parsed: unknown): LogSeverity {
  const fromObject =
    firstString(parsed, ['severity', 'level', 'log_level', 'status']) ?? ''

  for (const [severity, pattern] of SEVERITY_PATTERNS) {
    if (pattern.test(fromObject) || pattern.test(raw)) {
      return severity
    }
  }

  return parsed === null ? 'unknown' : 'info'
}

function buildSummary(
  raw: string,
  parsed: unknown,
  event: string | null,
): string {
  const summary =
    firstString(parsed, SUMMARY_PATHS) ??
    firstLeafString(parsed) ??
    raw.trim().replace(/\s+/g, ' ')

  if (!event) {
    return summary
  }

  if (summary === event || summary.startsWith(`${event}:`)) {
    return summary
  }

  return `${event}: ${summary}`
}

function firstString(value: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const candidate = getPath(value, path)
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim()
    }

    if (typeof candidate === 'number' || typeof candidate === 'boolean') {
      return String(candidate)
    }
  }

  return null
}

function getPath(value: unknown, path: string): unknown {
  const segments = path.split('.')
  let current: unknown = value

  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined
    }

    current = (current as Record<string, unknown>)[segment]
  }

  return current
}

function firstLeafString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim()
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = firstLeafString(item)
      if (candidate) {
        return candidate
      }
    }

    return null
  }

  for (const item of Object.values(value)) {
    const candidate = firstLeafString(item)
    if (candidate) {
      return candidate
    }
  }

  return null
}

function matchPattern(value: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (match?.[0]) {
      return match[0]
    }
  }

  return null
}
