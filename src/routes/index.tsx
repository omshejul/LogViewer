import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import JsonView from '@uiw/react-json-view'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  RefreshCw,
  Search,
} from 'lucide-react'
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Separator } from '#/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { DEFAULT_LOG_PATH } from '#/lib/config'
import { parseLogText, prettyPrintEntry } from '#/lib/log-viewer'
import type { LogEntry, LogSeverity } from '#/lib/log-viewer'
import { cn } from '#/lib/utils'

type SearchState = {
  file: string
}

const AUTO_REFRESH_INTERVAL_MS = 3000

type LogLoaderData =
  | {
      ok: true
      filePath: string
      resolvedPath: string
      loadedAt: string
      stats: {
        sizeBytes: number
        modifiedAt: string
        lineCount: number
        entryCount: number
        structuredCount: number
      }
      entries: LogEntry[]
    }
  | {
      ok: false
      filePath: string
      loadedAt: string
      error: string
      entries: []
    }

const readLogFile = createServerFn({ method: 'GET' })
  .inputValidator(
    (
      input:
        | undefined
        | {
            filePath?: string
          },
    ) => ({
      filePath:
        typeof input?.filePath === 'string' && input.filePath.trim() !== ''
          ? input.filePath.trim()
          : DEFAULT_LOG_PATH,
    }),
  )
  .handler(async ({ data }) => {
    const requestedPath = data.filePath

    if (!requestedPath) {
      return {
        ok: false,
        filePath: '',
        loadedAt: new Date().toISOString(),
        error:
          'No default log file is configured. Set VITE_LOG_VIEWER_DEFAULT_PATH in .env or load a file manually.',
        entries: [],
      }
    }

    try {
      const resolvedPath = path.resolve(requestedPath)
      const [content, stat] = await Promise.all([
        fs.readFile(resolvedPath, 'utf-8'),
        fs.stat(resolvedPath),
      ])

      const parsed = parseLogText(content)

      return {
        ok: true,
        filePath: requestedPath,
        resolvedPath,
        loadedAt: new Date().toISOString(),
        stats: {
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          lineCount: parsed.lineCount,
          entryCount: parsed.entries.length,
          structuredCount: parsed.structuredCount,
        },
        entries: parsed.entries,
      }
    } catch (error) {
      return {
        ok: false,
        filePath: requestedPath,
        loadedAt: new Date().toISOString(),
        error:
          error instanceof Error ? error.message : 'Unknown file read error',
        entries: [],
      }
    }
  })

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): SearchState => ({
    file:
      typeof search.file === 'string' && search.file.trim() !== ''
        ? search.file
        : DEFAULT_LOG_PATH,
  }),
  loaderDeps: ({ search }) => ({
    file: search.file,
  }),
  loader: async ({ deps }): Promise<LogLoaderData> => {
    return (await readLogFile({
      data: {
        filePath: deps.file,
      },
    })) as LogLoaderData
  },
  component: LogViewerRoute,
})

function LogViewerRoute() {
  const loaderData = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [data, setData] = useState(loaderData)

  const [fileInput, setFileInput] = useState(search.file)
  const [query, setQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState<'all' | LogSeverity>(
    'all',
  )
  const [sourceFilter, setSourceFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [detailMode, setDetailMode] = useState<'pretty' | 'raw'>('pretty')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [jsonTreeMode, setJsonTreeMode] = useState<
    'default' | 'expanded' | 'collapsed'
  >('default')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  )
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [relativeNow, setRelativeNow] = useState(() => Date.now())

  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const entries = data.entries

  const detailRef = useRef<HTMLDivElement | null>(null)
  const refreshInFlightRef = useRef(false)

  useEffect(() => {
    setData(loaderData)
  }, [loaderData])

  useEffect(() => {
    setFileInput(search.file)
  }, [search.file])

  const refreshData = useEffectEvent(async () => {
    if (refreshInFlightRef.current) {
      return
    }

    refreshInFlightRef.current = true
    setIsRefreshing(true)

    try {
      const nextData = (await readLogFile({
        data: {
          filePath: search.file,
        },
      })) as LogLoaderData

      setData((currentData) =>
        shouldReplaceLogData(currentData, nextData) ? nextData : currentData,
      )
    } finally {
      refreshInFlightRef.current = false
      setIsRefreshing(false)
    }
  })

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return
      }

      void refreshData()
    }, AUTO_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [refreshData, search.file])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRelativeNow(Date.now())
    }, 30_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    setCopyState('idle')
  }, [selectedId, detailMode])

  useEffect(() => {
    setJsonTreeMode('default')
    setDetailMode('pretty')
  }, [selectedId])

  const sourceCounts = new Map<string, number>()
  const eventCounts = new Map<string, number>()
  let issueCount = 0

  for (const entry of entries) {
    if (entry.source) {
      sourceCounts.set(entry.source, (sourceCounts.get(entry.source) ?? 0) + 1)
    }

    if (entry.event) {
      eventCounts.set(entry.event, (eventCounts.get(entry.event) ?? 0) + 1)
    }

    if (
      entry.severity === 'error' ||
      entry.severity === 'fatal' ||
      entry.severity === 'warn'
    ) {
      issueCount += 1
    }
  }

  const sourceOptions = [...sourceCounts.entries()].sort(
    ([leftKey, leftCount], [rightKey, rightCount]) =>
      rightCount - leftCount || leftKey.localeCompare(rightKey),
  )
  const sourceFilterOptions: Array<[string, string]> = [
    ['all', 'All sources'],
    ...sourceOptions.map(
      ([source, count]): [string, string] => [
        source,
        `${source} (${formatInteger(count)})`,
      ],
    ),
  ]
  const eventOptions = [...eventCounts.entries()]
    .sort(
      ([leftKey, leftCount], [rightKey, rightCount]) =>
        rightCount - leftCount || leftKey.localeCompare(rightKey),
    )
    .slice(0, 100)
  const eventFilterOptions: Array<[string, string]> = [
    ['all', 'All events'],
    ...eventOptions.map(
      ([event, count]): [string, string] => [
        event,
        `${event} (${formatInteger(count)})`,
      ],
    ),
  ]

  let filteredEntries = entries.filter((entry) => {
    if (severityFilter !== 'all' && entry.severity !== severityFilter) {
      return false
    }

    if (sourceFilter !== 'all' && entry.source !== sourceFilter) {
      return false
    }

    if (eventFilter !== 'all' && entry.event !== eventFilter) {
      return false
    }

    if (!deferredQuery) {
      return true
    }

    return [
      entry.raw,
      entry.preview,
      entry.summary,
      entry.timestamp,
      entry.source,
      entry.event,
      entry.severity,
    ]
      .filter(Boolean)
      .join('\n')
      .toLowerCase()
      .includes(deferredQuery)
  })

  if (sortOrder === 'newest') {
    filteredEntries = [...filteredEntries].reverse()
  }

  useEffect(() => {
    if (!filteredEntries.length) {
      setSelectedId(null)
      return
    }

    if (
      selectedId === null ||
      !filteredEntries.some((entry) => entry.id === selectedId)
    ) {
      setSelectedId(filteredEntries[0]?.id ?? null)
    }
  }, [filteredEntries, selectedId])

  const selectedEntry =
    filteredEntries.find((entry) => entry.id === selectedId) ?? null
  const selectedIndex = selectedEntry
    ? filteredEntries.findIndex((entry) => entry.id === selectedEntry.id)
    : -1

  useEffect(() => {
    if (!selectedEntry || !detailRef.current) return
    detailRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }, [selectedId])

  useEffect(() => {
    if (selectedEntry?.kind !== 'json' && detailMode === 'pretty') {
      setDetailMode('raw')
    }
  }, [detailMode, selectedEntry])

  const severityBadgeClassName: Record<LogSeverity, string> = {
    fatal: 'border-foreground/20 bg-foreground text-background',
    error: 'border-foreground/20 bg-foreground/12 text-foreground',
    warn: 'border-border bg-muted text-foreground',
    info: 'border-border bg-background text-foreground',
    debug: 'border-border bg-background text-muted-foreground',
    trace: 'border-border bg-background text-muted-foreground',
    unknown: 'border-border bg-muted text-muted-foreground',
  }

  const goToEntry = (direction: 'prev' | 'next') => {
    if (selectedIndex < 0) {
      return
    }

    const nextIndex = selectedIndex + (direction === 'next' ? 1 : -1)
    if (nextIndex < 0 || nextIndex >= filteredEntries.length) {
      return
    }

    setSelectedId(filteredEntries[nextIndex].id)
  }

  const applyFilePath = () => {
    startTransition(() => {
      navigate({
        search: {
          file: fileInput.trim() || DEFAULT_LOG_PATH,
        },
      })
    })
  }

  const copySelectedEntry = async () => {
    if (!selectedEntry || typeof navigator === 'undefined') {
      return
    }

    try {
      await navigator.clipboard.writeText(
        selectedEntry.kind === 'json' && detailMode === 'pretty'
          ? prettyPrintEntry(selectedEntry)
          : selectedEntry.raw,
      )
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1600)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 1600)
    }
  }

  return (
    <main className="page-wrap px-4 py-6 md:py-8">
      <section className="space-y-4">
        <Card className="overflow-hidden border-border/80 bg-card/88 shadow-xl shadow-black/5">
          <CardHeader className="gap-3 border-b border-border/70">
            <div className="space-y-1">
              <CardTitle className="text-2xl tracking-tight">
                Open log file
              </CardTitle>
              <CardDescription>
                Load a local log and jump straight into search and entries.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 py-0">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                File path
              </span>
              <Input
                value={fileInput}
                onChange={(event) => setFileInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    applyFilePath()
                  }
                }}
                placeholder={DEFAULT_LOG_PATH || '/path/to/your/logfile.log'}
                className="bg-background/80 font-mono text-xs"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Button type="button" onClick={applyFilePath} className="h-11 min-w-32">
                <FileText className="size-4" />
                Load file
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => void refreshData()}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={cn('size-4', isRefreshing && 'animate-spin')}
                />
                {isRefreshing ? 'Refreshing' : 'Refresh'}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Auto refresh every {Math.round(AUTO_REFRESH_INTERVAL_MS / 1000)}s
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/88 shadow-xl shadow-black/5">
            <CardHeader className="gap-4 border-b border-border/70">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">Browse entries</CardTitle>
                  <CardDescription>
                    {formatInteger(filteredEntries.length)} shown from{' '}
                    {formatInteger(entries.length)} entries.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={sortOrder === 'newest' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSortOrder('newest')}
                  >
                    <ArrowDown className="size-4" />
                    Newest first
                  </Button>
                  <Button
                    type="button"
                    variant={sortOrder === 'oldest' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSortOrder('oldest')}
                  >
                    <ArrowUp className="size-4" />
                    Oldest first
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 py-6">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.45fr))]">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Search
                  </span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Find text, event names, ids, or messages"
                      className="h-10 bg-background/80 pl-9"
                    />
                  </div>
                </label>

                <FilterSelect
                  label="Severity"
                  value={severityFilter}
                  onChange={(value) =>
                    setSeverityFilter(value as 'all' | LogSeverity)
                  }
                  options={[
                    ['all', 'All severities'],
                    ['fatal', 'Fatal'],
                    ['error', 'Error'],
                    ['warn', 'Warn'],
                    ['info', 'Info'],
                    ['debug', 'Debug'],
                    ['trace', 'Trace'],
                    ['unknown', 'Unknown'],
                  ]}
                />

                <FilterSelect
                  label="Source"
                  value={sourceFilter}
                  onChange={setSourceFilter}
                  options={sourceFilterOptions}
                />

                <FilterSelect
                  label="Event"
                  value={eventFilter}
                  onChange={setEventFilter}
                  options={eventFilterOptions}
                />
              </div>

              <Separator />

              {!data.ok ? (
                <div className="rounded-2xl border border-border bg-muted px-4 py-4 text-sm text-foreground">
                  Failed to read{' '}
                  <span className="font-mono">{data.filePath}</span>.
                  <div className="mt-2 font-mono text-xs opacity-80">
                    {data.error}
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
                  <div className="rounded-2xl border border-border/70 bg-background/72">
                    <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                      <div>
                        <p className="m-0 text-sm font-semibold">Entries</p>
                        <p className="m-0 text-xs text-muted-foreground">
                          {formatInteger(filteredEntries.length)} shown from{' '}
                          {formatInteger(entries.length)}
                        </p>
                      </div>
                      <Badge variant="outline" className="font-mono">
                        {formatBytes(data.stats.sizeBytes)}
                      </Badge>
                    </div>

                    <ScrollArea className="h-[62vh]">
                      <div className="space-y-2 p-3">
                        {filteredEntries.length ? (
                          filteredEntries.map((entry) => (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => {
                                setSelectedId(entry.id)
                                setDetailMode(
                                  entry.kind === 'json' ? 'pretty' : 'raw',
                                )
                              }}
                              className={cn(
                                'w-full rounded-2xl border px-4 py-3 text-left transition',
                                selectedId === entry.id
                                  ? 'border-primary/40 bg-primary/10 shadow-sm'
                                  : 'border-border/70 bg-card/72 hover:border-border hover:bg-accent/40',
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'font-mono text-[11px] uppercase',
                                    severityBadgeClassName[entry.severity],
                                  )}
                                >
                                  {entry.severity}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="font-mono text-[11px]"
                                >
                                  lines {entry.startLine}
                                  {entry.endLine > entry.startLine
                                    ? `-${entry.endLine}`
                                    : ''}
                                </Badge>
                                {entry.source ? (
                                  <Badge
                                    variant="outline"
                                    className="font-mono text-[11px]"
                                  >
                                    {entry.source}
                                  </Badge>
                                ) : null}
                                {entry.event ? (
                                  <span className="text-xs font-semibold text-foreground">
                                    {entry.event}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-2 text-sm leading-6 text-foreground">
                                {entry.preview}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                                <span>
                                  {entry.timestamp
                                    ? formatRelativeTimestamp(
                                        entry.timestamp,
                                        relativeNow,
                                      )
                                    : 'No timestamp'}
                                </span>
                                <span>
                                  {entry.kind === 'json'
                                    ? 'Structured'
                                    : 'Plain text'}
                                </span>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/70 px-6 text-center text-sm text-muted-foreground">
                            No log entries match the current filters.
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  <Card
                    ref={detailRef}
                    className="border-border/70 bg-background/72"
                  >
                    <CardHeader className="gap-3 border-b border-border/70">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">
                            Entry details
                          </CardTitle>
                          <CardDescription>
                            Raw log text and prettified JSON for the selected
                            entry.
                          </CardDescription>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => goToEntry('prev')}
                            disabled={selectedIndex <= 0}
                          >
                            <ChevronLeft className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => goToEntry('next')}
                            disabled={
                              selectedIndex < 0 ||
                              selectedIndex >= filteredEntries.length - 1
                            }
                          >
                            <ChevronRight className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 py-6">
                      {selectedEntry ? (
                        <>
                          <div className="flex flex-wrap gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                'font-mono text-[11px] uppercase',
                                severityBadgeClassName[selectedEntry.severity],
                              )}
                            >
                              {selectedEntry.severity}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="font-mono text-[11px]"
                            >
                              {selectedEntry.kind === 'json'
                                ? 'Structured'
                                : 'Text'}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="font-mono text-[11px]"
                            >
                              lines {selectedEntry.startLine}
                              {selectedEntry.endLine > selectedEntry.startLine
                                ? `-${selectedEntry.endLine}`
                                : ''}
                            </Badge>
                            {selectedEntry.source ? (
                              <Badge
                                variant="outline"
                                className="font-mono text-[11px]"
                              >
                                {selectedEntry.source}
                              </Badge>
                            ) : null}
                          </div>

                          <div className="space-y-2">
                            <p className="m-0 text-sm font-semibold text-foreground">
                              {selectedEntry.summary}
                            </p>
                            <p className="m-0 text-xs text-muted-foreground">
                              {selectedEntry.timestamp
                                ? formatTimestampWithAbsolute(
                                    selectedEntry.timestamp,
                                    relativeNow,
                                  )
                                : 'No timestamp detected'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex max-w-full flex-wrap items-center rounded-lg border border-border/70 bg-muted/40 p-0.5">
                              <Button
                                type="button"
                                variant={detailMode === 'pretty' ? 'default' : 'ghost'}
                                size="sm"
                                className="h-7 rounded-md px-3 text-xs"
                                onClick={() => setDetailMode('pretty')}
                                disabled={selectedEntry.kind !== 'json'}
                              >
                                Pretty JSON
                              </Button>
                              <div className="mx-0.5 h-4 w-px bg-border/60" />
                              <Button
                                type="button"
                                variant={detailMode === 'raw' ? 'default' : 'ghost'}
                                size="sm"
                                className="h-7 rounded-md px-3 text-xs"
                                onClick={() => setDetailMode('raw')}
                              >
                                Raw text
                              </Button>
                            </div>

                            <div className="flex max-w-full flex-wrap items-center rounded-lg border border-border/70 bg-muted/40 p-0.5">
                              {selectedEntry.kind === 'json' && detailMode === 'pretty' && (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 rounded-md px-3 text-xs"
                                    onClick={() => setJsonTreeMode('expanded')}
                                  >
                                    Expand all
                                  </Button>
                                  <div className="mx-0.5 h-4 w-px bg-border/60" />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 rounded-md px-3 text-xs"
                                    onClick={() => setJsonTreeMode('collapsed')}
                                  >
                                    Collapse all
                                  </Button>
                                  <div className="mx-0.5 h-4 w-px bg-border/60" />
                                </>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-md px-3 text-xs"
                                onClick={copySelectedEntry}
                              >
                                {copyState === 'copied' ? (
                                  <Check className="size-3" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                                {copyState === 'copied'
                                  ? 'Copied'
                                  : copyState === 'error'
                                    ? 'Copy failed'
                                    : selectedEntry.kind === 'json' && detailMode === 'pretty'
                                      ? 'Copy JSON'
                                      : 'Copy raw'}
                              </Button>
                            </div>
                          </div>

                          <ScrollArea className="h-[50vh] rounded-2xl border border-border/70 bg-card text-foreground">
                            {detailMode === 'pretty' &&
                            selectedEntry.kind === 'json' ? (
                              <div className="min-h-full p-4">
                                <JsonView
                                  key={`${selectedEntry.id}-${jsonTreeMode}`}
                                  value={selectedEntry.parsed as object}
                                  collapsed={
                                    jsonTreeMode === 'expanded'
                                      ? false
                                      : jsonTreeMode === 'collapsed'
                                        ? true
                                        : 2
                                  }
                                  enableClipboard
                                  displayDataTypes={false}
                                  displayObjectSize
                                  shortenTextAfterLength={120}
                                  style={{
                                    backgroundColor: 'transparent',
                                    fontSize: '15px',
                                    fontFamily: 'var(--font-mono)',
                                    lineHeight: '1.6',
                                    ['--w-rjv-background-color' as string]: 'transparent',
                                    ['--w-rjv-color' as string]: 'var(--foreground)',
                                    ['--w-rjv-key-string' as string]: 'var(--foreground)',
                                    ['--w-rjv-string-color' as string]: 'color-mix(in oklab, var(--foreground) 72%, var(--background))',
                                    ['--w-rjv-info-color' as string]: 'var(--muted-foreground)',
                                    ['--w-rjv-type-int-color' as string]: 'var(--foreground)',
                                    ['--w-rjv-type-float-color' as string]: 'var(--foreground)',
                                    ['--w-rjv-type-boolean-color' as string]: 'var(--foreground)',
                                    ['--w-rjv-type-null-color' as string]: 'var(--muted-foreground)',
                                    ['--w-rjv-arrow-color' as string]: 'var(--muted-foreground)',
                                    ['--w-rjv-ellipsis-color' as string]: 'var(--muted-foreground)',
                                    ['--w-rjv-curlybraces-color' as string]: 'var(--muted-foreground)',
                                    ['--w-rjv-brackets-color' as string]: 'var(--muted-foreground)',
                                    ['--w-rjv-colon-color' as string]: 'var(--muted-foreground)',
                                    ['--w-rjv-copied-color' as string]: 'var(--foreground)',
                                    ['--w-rjv-copy-color' as string]: 'var(--muted-foreground)',
                                    ['--w-rjv-object-size-color' as string]: 'var(--muted-foreground)',
                                  }}
                                />
                              </div>
                            ) : (
                              <pre className="m-0 p-4 font-mono text-[12px] leading-6 whitespace-pre-wrap">
                                {selectedEntry.raw}
                              </pre>
                            )}
                          </ScrollArea>
                        </>
                      ) : (
                        <div className="flex h-[50vh] items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/70 px-6 text-center text-sm text-muted-foreground">
                          Pick an entry to inspect its raw content.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/80 bg-card/88 shadow-xl shadow-black/5">
            <CardHeader>
              <CardTitle className="text-lg">File metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <MetadataRow label="Requested path" value={search.file} mono />
              {data.ok ? (
                <>
                  <MetadataRow
                    label="Resolved path"
                    value={data.resolvedPath}
                    mono
                  />
                  <MetadataRow
                    label="Modified"
                    value={formatTimestampWithAbsolute(
                      data.stats.modifiedAt,
                      relativeNow,
                    )}
                  />
                </>
              ) : null}
              <MetadataRow
                label="Loaded"
                value={formatTimestampWithAbsolute(data.loadedAt, relativeNow)}
              />
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/88 shadow-xl shadow-black/5">
            <CardHeader>
              <CardTitle className="text-lg">Parsing notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p className="m-0">
                Each entry starts on a new non-indented line. Indented lines and
                common stack-trace continuations stay attached to the previous
                entry.
              </p>
              <p className="m-0">
                Structured JSON logs expose inferred source, event, timestamp,
                and severity fields. Plain text logs fall back to raw-text
                search and heuristics.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 w-full bg-background/80">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

function MetadataRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="m-0 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'm-0 text-sm text-foreground',
          mono && 'break-all font-mono text-[12px] leading-5',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes / 1024
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function formatAbsoluteTimestamp(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

function formatRelativeTimestamp(value: string, now: number): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const diffMs = date.getTime() - now
  const diffSeconds = Math.round(diffMs / 1000)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ]

  for (const [unit, secondsPerUnit] of ranges) {
    if (Math.abs(diffSeconds) >= secondsPerUnit || unit === 'second') {
      return rtf.format(Math.round(diffSeconds / secondsPerUnit), unit)
    }
  }

  return value
}

function formatTimestampWithAbsolute(value: string, now: number): string {
  const absolute = formatAbsoluteTimestamp(value)
  const relative = formatRelativeTimestamp(value, now)

  if (absolute === value) {
    return value
  }

  return `${relative} (${absolute})`
}

function shouldReplaceLogData(
  currentData: LogLoaderData,
  nextData: LogLoaderData,
): boolean {
  if (currentData.ok !== nextData.ok) {
    return true
  }

  if (!currentData.ok && !nextData.ok) {
    return (
      currentData.filePath !== nextData.filePath ||
      currentData.error !== nextData.error
    )
  }

  if (currentData.ok && nextData.ok) {
    return (
      currentData.filePath !== nextData.filePath ||
      currentData.resolvedPath !== nextData.resolvedPath ||
      currentData.stats.sizeBytes !== nextData.stats.sizeBytes ||
      currentData.stats.modifiedAt !== nextData.stats.modifiedAt ||
      currentData.stats.lineCount !== nextData.stats.lineCount ||
      currentData.stats.entryCount !== nextData.stats.entryCount ||
      currentData.stats.structuredCount !== nextData.stats.structuredCount
    )
  }

  return false
}
