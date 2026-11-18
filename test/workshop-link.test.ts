import { describe, expect, it } from 'vitest'
import { workshopItemId } from '~/utils/workshop-link'

describe('workshopItemId', () => {
  it('reads item pages on steamcommunity.com', () => {
    expect(workshopItemId('https://steamcommunity.com/sharedfiles/filedetails/?id=2347202203')).toBe('2347202203')
    expect(workshopItemId('https://steamcommunity.com/workshop/filedetails/?searchtext=&id=123')).toBe('123')
    expect(workshopItemId('http://steamcommunity.com/sharedfiles/filedetails?id=5')).toBe('5')
  })

  it('reads steam:// links and the link filter', () => {
    expect(workshopItemId('steam://url/CommunityFilePage/987')).toBe('987')
    const inner = encodeURIComponent('https://steamcommunity.com/sharedfiles/filedetails/?id=42')
    expect(workshopItemId(`https://steamcommunity.com/linkfilter/?u=${inner}`)).toBe('42')
    expect(workshopItemId(`https://steamcommunity.com/linkfilter/?url=${inner}`)).toBe('42')
  })

  it('ignores other pages and hosts', () => {
    expect(workshopItemId('https://steamcommunity.com/app/281990/workshop/')).toBeNull()
    expect(workshopItemId('https://steamcommunity.com/sharedfiles/filedetails/?id=abc')).toBeNull()
    expect(workshopItemId('https://example.com/sharedfiles/filedetails/?id=1')).toBeNull()
    expect(workshopItemId('https://steamcommunity.com.evil.com/sharedfiles/filedetails/?id=1')).toBeNull()
    expect(workshopItemId(`https://steamcommunity.com/linkfilter/?u=${encodeURIComponent('https://github.com')}`)).toBeNull()
    expect(workshopItemId('not a url')).toBeNull()
  })
})
