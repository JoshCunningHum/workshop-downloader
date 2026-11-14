// Whether the database opened (see plugins/db.client.ts). Queries go through lib/services.
export function useDb() {
  const ready = useState('db:ready', () => false)
  const error = useState<string | null>('db:error', () => null)

  return {
    ready: readonly(ready),
    error: readonly(error)
  }
}
