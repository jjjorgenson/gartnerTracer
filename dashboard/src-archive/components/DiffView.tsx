/**
 * Simple +/- line diff view (green/red) for unified diff text.
 */
export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n')
  return (
    <pre className="m-0 font-mono text-xs">
      {lines.map((line, i) => {
    if (line.startsWith('+++') || line.startsWith('---')) {
      return <div key={i} className="text-[var(--color-text-subtle)]">{line}</div>
    }
        if (line.startsWith('+') && !line.startsWith('+++')) {
          return <div key={i} className="bg-[var(--color-success)]/20 text-[var(--color-success)]">{line}</div>
        }
        if (line.startsWith('-') && !line.startsWith('---')) {
          return <div key={i} className="bg-[var(--color-danger)]/20 text-[var(--color-danger)]">{line}</div>
        }
        return <div key={i} className="text-[var(--color-text-muted)]">{line}</div>
      })}
    </pre>
  )
}
