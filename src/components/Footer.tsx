export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border/70 px-4 py-6 text-muted-foreground">
      <div className="page-wrap flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
        <p className="m-0 text-sm">&copy; {year} Local Log Viewer</p>
        <p className="m-0 text-sm">
          TanStack Start, shadcn/ui, and Tailwind. Reads files on the server and
          renders them locally.
        </p>
      </div>
    </footer>
  )
}
