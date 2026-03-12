# LogViewer

Local-first log viewer built with TanStack Start, shadcn/ui, and Tailwind.

## Features

- Reads a local log file on the server
- Works with JSON logs, plain text logs, and multiline stack traces
- Search, severity/source/event filters, and newest/oldest ordering
- Collapsible JSON tree with copy, expand-all, and collapse-all controls
- Monochrome SVG app icon and favicon

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create `.env` from `.env.example` and set your default log file:

```bash
cp .env.example .env
```

```env
VITE_LOG_VIEWER_DEFAULT_PATH=/absolute/path/to/your/logfile.log
```

3. Start the app:

```bash
pnpm dev
```

The dev server runs on `http://localhost:3050`.

## Scripts

```bash
pnpm dev
pnpm build
pnpm lint
```

## Notes

- The UI also lets you override the file path at runtime.
- The default path is intentionally loaded from `.env` instead of being hardcoded in source.
