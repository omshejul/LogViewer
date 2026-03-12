import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { DEFAULT_LOG_PATH } from '#/lib/config'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="page-wrap px-4 py-8">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border/80 bg-card/86 shadow-lg shadow-black/5">
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              About
            </p>
            <CardTitle className="text-3xl tracking-tight">
              A generic local viewer for log files.
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
            <p className="m-0">
              The home route reads a log file through a TanStack Start server
              function, parses each entry with loose heuristics, and renders a
              searchable split-pane viewer. JSON logs get structured metadata.
              Plain text and multiline stack traces still render as readable
              entries.
            </p>
            <p className="m-0">
              By default it loads
              <code className="mx-1">
                {DEFAULT_LOG_PATH || '/path/to/your/logfile.log'}
              </code>
              but the file path field on the home page lets you point the UI at
              any other readable local log file.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/86 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-lg">Usage notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p className="m-0">
              Search runs client-side across the loaded file.
            </p>
            <p className="m-0">
              The severity, source, and event filters are inferred from the log
              content when possible.
            </p>
            <p className="m-0">
              Large multiline entries stay grouped in the details pane so stack
              traces and pretty JSON remain intact.
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
