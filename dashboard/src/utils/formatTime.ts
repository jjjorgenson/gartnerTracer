import { formatDistanceToNow, parseISO } from 'date-fns'

export function formatRelativeTime(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true })
  } catch {
    return iso
  }
}
