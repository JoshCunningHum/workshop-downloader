// The categories of the Settings page, in sidebar order.
export const SETTINGS_CATEGORIES = [
  { id: 'library', label: 'Library & downloads', icon: 'i-lucide-download' },
  { id: 'steam', label: 'Steam', icon: 'i-simple-icons-steam' },
  { id: 'accounts', label: 'Steam accounts', icon: 'i-lucide-users' },
  { id: 'steamcmd', label: 'SteamCMD', icon: 'i-lucide-terminal' },
  { id: 'diagnostics', label: 'Diagnostics', icon: 'i-lucide-activity' }
] as const

export type SettingsCategory = typeof SETTINGS_CATEGORIES[number]['id']
