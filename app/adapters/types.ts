// Adapter = declarative rules for one game: where mods are linked, and how to read the
// installed game version and the game versions an item supports. Stored as JSON.

export type ExtractRule
  = | {
    source: 'tags'
    /** Applied to each tag; capture group 1 (or the whole match) is the version. */
    regex: string
  }
  | {
    source: 'file'
    /**
     * For item versions: glob relative to the snapshot folder (e.g. "About/About.xml").
     * For the game version: path relative to the install folder, optionally written as "{install}/...".
     */
    glob?: string
    path?: string
    /** Exactly one of these picks values out of the file; `regex` can also post-process the others. */
    regex?: string
    jsonPath?: string
    xpath?: string
  }
  | {
    source: 'buildid'
    regex?: string
  }

export interface AdapterDefinition {
  id: string
  name: string
  /** Steam AppID this adapter is for; null for generic adapters that fit any game. */
  appId: number | null
  /** Template for the mod folder: {install}, {appId}. */
  modsPath?: string
  /** Template for the link's folder name inside modsPath: {itemId}, {title}, {appId}. */
  linkName?: string
  /**
   * Globs relative to an item folder (e.g. "About/About.xml"); when set, a folder found in the
   * mods folder only counts as a workshop item if at least one of them matches.
   */
  itemManifest?: string[]
  gameVersion?: ExtractRule[]
  itemVersions?: ExtractRule[]
}

export interface FileContent {
  path: string
  content: string
  truncated: boolean
}

export interface ExtractContext {
  tags: string[]
  /** Snapshot folder of the item (item versions). */
  itemRoot?: string | null
  /** Game install folder (game version). */
  installPath?: string | null
  /** Installed buildid from appmanifest_<appid>.acf. */
  buildId?: string | null
  readFiles: (root: string, globs: string[]) => Promise<FileContent[]>
}
