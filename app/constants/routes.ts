// Every page of the app; links and navigation build paths from here.
export const ROUTES = {
  home: '/',
  setup: '/setup',
  games: '/apps',
  game: (appId: number) => `/apps/${appId}`,
  workshop: '/workshop',
  workshopApp: (appId: number) => `/workshop/${appId}`,
  item: (itemId: string) => `/items/${itemId}`,
  adapters: '/adapters',
  adapter: (id: string) => `/adapters/${id}`,
  newAdapter: (from?: string) => (from ? `/adapters/new?from=${from}` : '/adapters/new'),
  settings: '/settings',
  fswatch: '/dev/fswatch'
} as const
