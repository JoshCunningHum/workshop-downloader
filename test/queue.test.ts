import { describe, expect, it } from 'vitest'
import { toQueueEntries } from '~/utils/queue'
import type { ItemDetails } from '~/types/steam'

function item(id: string, patch: Partial<ItemDetails> = {}): ItemDetails {
  return {
    id, result: 1, appId: 281990, title: `Item ${id}`, creator: '1', previewUrl: null, fileSize: 10,
    timeCreated: 1, timeUpdated: 100, tags: [], banned: false, description: '', subscriptions: 0, favorited: 0, views: 0,
    ...patch
  }
}

describe('toQueueEntries', () => {
  it('ticks new items and items with an older snapshot', () => {
    const entries = toQueueEntries([item('1'), item('2')], new Map([['2', 50]]), { 281990: 'Stellaris' })
    expect(entries.map(e => [e.details.id, e.checked, e.downloaded, e.hasSnapshot, e.appName])).toEqual([
      ['1', true, false, false, 'Stellaris'],
      ['2', true, false, true, 'Stellaris']
    ])
  })

  it('queues items whose latest revision is downloaded, unticked', () => {
    const [entry] = toQueueEntries([item('1')], new Map([['1', 100]]), {})
    expect(entry).toMatchObject({ checked: false, downloaded: true, hasSnapshot: true, appName: null })
  })

  it('drops items Steam did not return and items without an app', () => {
    const entries = toQueueEntries([item('1', { result: 9 }), item('2', { appId: 0 }), item('3')], new Map(), {})
    expect(entries.map(e => e.details.id)).toEqual(['3'])
  })
})
