// Runs an action and shows an error toast ("<label> failed") instead of throwing.
export function useAttempt() {
  const toast = useToast()

  return async function attempt(label: string, action: () => Promise<unknown>) {
    try {
      await action()
    } catch (e) {
      toast.add({ title: `${label} failed`, description: e instanceof Error ? e.message : String(e), color: 'error' })
    }
  }
}
