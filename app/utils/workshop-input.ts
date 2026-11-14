// Pulls workshop ids out of pasted text: bare ids, item/collection URLs
// (steamcommunity.com/sharedfiles/filedetails/?id=123, /workshop/filedetails/?id=123),
// and steam:// links. Order is kept, duplicates dropped.
export function parseWorkshopIds(text: string): string[] {
  const ids: string[] = []
  for (const token of text.split(/[\s,;]+/)) {
    if (!token) continue
    const fromUrl = token.match(/[?&]id=(\d+)/) ?? token.match(/steam:\/\/url\/CommunityFilePage\/(\d+)/i)
    const id = fromUrl?.[1] ?? (/^\d+$/.test(token) ? token : undefined)
    if (id && id !== '0' && !ids.includes(id)) ids.push(id)
  }
  return ids
}
