export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n')
  return (
    <pre className="m-0 text-xs leading-relaxed" style={{ fontFamily: 'var(--font-mono)' }}>
      {lines.map((line, i) => {
        if (line.startsWith('+++') || line.startsWith('---')) {
          return <div key={i} className="text-[var(--color-text-subtle)]">{line}</div>
        }
        if (line.startsWith('+') && !line.startsWith('+++')) {
          return <div key={i} className="bg-[var(--color-success)]/10 text-[var(--color-success)]">{line}</div>
        }
        if (line.startsWith('-') && !line.startsWith('---')) {
          return <div key={i} className="bg-[var(--color-danger)]/10 text-[var(--color-danger)]">{line}</div>
        }
        if (line.startsWith('@@')) {
          return <div key={i} className="text-[var(--color-accent)] opacity-60">{line}</div>
        }
        return <div key={i} className="text-[var(--color-text-subtle)]">{line}</div>
      })}
    </pre>
  )
}
