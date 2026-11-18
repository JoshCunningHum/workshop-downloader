/** Bars in an item's speed graph; each covers 1/N of the item's size. */
export const SPEED_BARS = 48
/** Weight of the newest sample in the shown speed (smooths the 500 ms folder-size readings). */
const SMOOTHING = 0.3
/** Below this (bytes/s) the item counts as stalled: no time left is shown. */
const STALLED = 1024

interface Track {
  lastBytes: number
  lastAt: number
  /** Smoothed speed in bytes/s. */
  speed: number
  /** Per bar: summed speed samples and how many. */
  sums: number[]
  counts: number[]
}

// Per item of a job ("jobId:itemId"), for this session only. Speed is how fast the item's
// SteamCMD staging folders grow, fed by the job's progress events.
const tracks = reactive(new Map<string, Track>())

const keyOf = (jobId: string, itemId: string) => `${jobId}:${itemId}`

/** Download speed, speed graph and time left of the items being downloaded. */
export function useItemSpeed() {
  /** Adds a progress reading (bytes so far of `total`). */
  function record(jobId: string, itemId: string, bytes: number, total: number) {
    const key = keyOf(jobId, itemId)
    const now = Date.now()
    const track = tracks.get(key)
    if (!track) {
      tracks.set(key, { lastBytes: bytes, lastAt: now, speed: 0, sums: Array(SPEED_BARS).fill(0), counts: Array(SPEED_BARS).fill(0) })
      return
    }
    const seconds = (now - track.lastAt) / 1000
    if (seconds <= 0) return
    // Shrinking happens when SteamCMD moves files from downloads/ to content/; not a speed.
    const delta = Math.max(0, bytes - track.lastBytes)
    const sample = delta / seconds
    track.speed = track.speed ? track.speed + SMOOTHING * (sample - track.speed) : sample

    if (total > 0) {
      // Every bar this reading covers gets the speed, so a big jump leaves no gaps.
      const from = Math.min(SPEED_BARS - 1, Math.floor(track.lastBytes / total * SPEED_BARS))
      const to = Math.min(SPEED_BARS - 1, Math.floor(bytes / total * SPEED_BARS))
      for (let i = from; i <= Math.max(from, to); i++) {
        track.sums[i]! += track.speed
        track.counts[i]!++
      }
    }
    track.lastBytes = Math.max(track.lastBytes, bytes)
    track.lastAt = now
  }

  /** The item stopped downloading (done, failed, cancelled): its graph stays, its speed goes. */
  function stop(jobId: string, itemId: string) {
    const track = tracks.get(keyOf(jobId, itemId))
    if (track) track.speed = 0
  }

  /**
   * Speed (bytes/s), graph bars (0..1 of the item's fastest bar, null with no readings yet)
   * and seconds left (null while stalled or unknown).
   */
  function stats(jobId: string, itemId: string, bytes: number, total: number) {
    const track = tracks.get(keyOf(jobId, itemId))
    if (!track) return { speed: 0, bars: null, eta: null }
    const averages = track.sums.map((sum, i) => track.counts[i] ? sum / track.counts[i]! : 0)
    const peak = Math.max(...averages)
    const bars = peak > 0 ? averages.map(v => v / peak) : null
    const eta = track.speed >= STALLED && total > bytes ? (total - bytes) / track.speed : null
    return { speed: track.speed, bars, eta }
  }

  /** Forgets items whose rows are gone (`keys` are the "jobId:itemId" rows still listed). */
  function prune(keys: Iterable<string>) {
    const keep = new Set(keys)
    for (const key of [...tracks.keys()]) if (!keep.has(key)) tracks.delete(key)
  }

  return { record, stop, stats, prune }
}
