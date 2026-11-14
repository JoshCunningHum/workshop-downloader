/** Steam store data older than this is fetched again. */
export const STORE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** steam_apps rows per insert: SQLite allows 999 bound variables per statement, 4 columns per row. */
export const APP_INDEX_BATCH = 200
