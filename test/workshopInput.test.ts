import { describe, expect, it } from 'vitest'
import { parseWorkshopIds } from '~/utils/workshopInput'

describe('parseWorkshopIds', () => {
  it('reads ids and urls, keeps order, drops duplicates', () => {
    const text = `
      https://steamcommunity.com/sharedfiles/filedetails/?id=2009463077
      https://steamcommunity.com/workshop/filedetails/?l=english&id=123, 456
      2009463077 steam://url/CommunityFilePage/789
      not-an-id https://example.com/x 0
    `
    expect(parseWorkshopIds(text)).toEqual(['2009463077', '123', '456', '789'])
  })
})
