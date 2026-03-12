import { Link } from '@tanstack/react-router'
import { DEFAULT_LOG_PATH } from '#/lib/config'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/88 px-4 backdrop-blur-xl">
      <nav className="page-wrap flex flex-wrap items-center gap-3 py-3">
        <h1 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            search={{ file: DEFAULT_LOG_PATH }}
            className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/80 px-4 py-2 text-sm text-foreground no-underline shadow-sm transition hover:border-border hover:bg-card"
          >
            <span className="size-2 rounded-full bg-[linear-gradient(135deg,#c9842d,#f2c879)]" />
            Local Log Viewer
          </Link>
        </h1>

        <div className="order-3 flex w-full flex-wrap items-center gap-4 text-sm font-medium text-muted-foreground sm:order-2 sm:w-auto">
          <Link
            to="/"
            search={{ file: DEFAULT_LOG_PATH }}
            className="rounded-full px-2 py-1 text-muted-foreground no-underline transition hover:bg-accent hover:text-foreground"
            activeProps={{
              className:
                'rounded-full bg-accent px-2 py-1 text-foreground no-underline',
            }}
          >
            Viewer
          </Link>
          <Link
            to="/about"
            className="rounded-full px-2 py-1 text-muted-foreground no-underline transition hover:bg-accent hover:text-foreground"
            activeProps={{
              className:
                'rounded-full bg-accent px-2 py-1 text-foreground no-underline',
            }}
          >
            About
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <p className="hidden text-xs text-muted-foreground lg:block">
            Local-only reader for arbitrary log files
          </p>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
