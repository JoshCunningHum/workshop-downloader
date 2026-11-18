// Placeholder art for the demo library: gradient banners and item thumbnails as SVG data URIs,
// so the screenshots need no network and show no real game or mod artwork.

const svg = (body: string, w: number, h: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`

const esc = (text: string) => text.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)

/** A Steam-store-sized header (460x215) with the game's name. */
export function banner(name: string, hue: number) {
  return svg(`
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 70% 32%)"/><stop offset="1" stop-color="hsl(${hue + 50} 65% 14%)"/>
    </linearGradient></defs>
    <rect width="460" height="215" fill="url(#g)"/>
    <circle cx="380" cy="40" r="90" fill="hsl(${hue + 20} 80% 60% / .18)"/>
    <circle cx="70" cy="200" r="70" fill="hsl(${hue - 20} 80% 60% / .14)"/>
    <text x="28" y="130" font-family="Georgia, serif" font-size="40" font-weight="bold" fill="white">${esc(name)}</text>`, 460, 215)
}

/** A square thumbnail with the item's initials. */
export function thumbnail(title: string, hue: number) {
  const initials = title.split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return svg(`
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue % 360} 65% 52%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 60% 30%)"/>
    </linearGradient></defs>
    <rect width="128" height="128" fill="url(#g)"/>
    <text x="64" y="80" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="46" font-weight="bold" fill="white" fill-opacity=".92">${esc(initials)}</text>`, 128, 128)
}
