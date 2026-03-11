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
          return <div key={i} className="bg-emerald-900/30 text-emerald-200">{line}</div>
        }
        if (line.startsWith('-') && !line.startsWith('---')) {
          return <div key={i} className="bg-red-900/30 text-red-200">{line}</div>
        }
        return <div key={i} className="text-[var(--color-text-muted)]">{line}</div>
      })}
    </pre>
  )
}
