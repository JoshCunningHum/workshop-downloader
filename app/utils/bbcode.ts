// Steam Workshop descriptions are BBCode. This turns them into HTML for v-html: the text is
// HTML-escaped first, then only known tags become elements, and links/images keep http(s) URLs
// only. Unbalanced tags are left to the browser's HTML parser, which closes them safely.

const escapeHtml = (text: string) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

/** The URL if it's http(s) (already escaped, so safe inside a quoted attribute), else null. */
function webUrl(url: string): string | null {
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

/** Tags that map straight to an element. */
const SIMPLE: Record<string, string> = {
  b: 'strong',
  i: 'em',
  u: 'u',
  s: 's',
  strike: 's',
  h1: 'h4',
  h2: 'h5',
  h3: 'h6',
  quote: 'blockquote',
  list: 'ul',
  olist: 'ol',
  table: 'table',
  tr: 'tr',
  td: 'td',
  th: 'th',
  spoiler: 'span class="bb-spoiler"'
}

/** Steam tags with nothing to show here; the tag goes, its text stays. */
const DROPPED = ['previewyoutube', 'emoticon', 'size', 'color', 'center']

/** Block elements: newlines next to them are layout in the source, not line breaks. */
const BLOCK = /\n*(<\/?(?:ul|ol|li|h4|h5|h6|blockquote|table|tr|td|th|pre|hr)\b[^>]*>)\n*/g

export function bbcodeToHtml(source: string): string {
  // U+E000 (private use) marks literal blocks below; drop any in the source.
  let html = escapeHtml(source.replace(/\uE000/g, '').replace(/\r\n?/g, '\n').trim())

  // [noparse] and [code] keep their contents as typed.
  const literal: string[] = []
  html = html.replace(/\[(noparse|code)\]([\s\S]*?)\[\/\1\]/gi, (_, tag: string, body: string) => {
    literal.push(tag.toLowerCase() === 'code' ? `<pre><code>${body}</code></pre>` : body)
    return `\uE000${literal.length - 1}\uE000`
  })

  html = html
    .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_, url: string) => {
      const href = webUrl(url)
      return href ? `<a href="${href}">${url}</a>` : url
    })
    .replace(/\[url=([^\]]*)\]/gi, (_, url: string) => {
      const href = webUrl(url)
      return href ? `<a href="${href}">` : '<a>'
    })
    .replace(/\[\/url\]/gi, '</a>')
    .replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (_, url: string) => {
      const src = webUrl(url)
      return src ? `<img src="${src}" alt="" loading="lazy">` : ''
    })
    .replace(/\[quote=[^\]]*\]/gi, '<blockquote>')
    .replace(/\[\*\]/g, '<li>')
    .replace(/\[hr\](\[\/hr\])?/gi, '<hr>')
    .replace(/\[(\/?)([a-z0-9]+)\]/gi, (match, close: string, tag: string) => {
      const element = SIMPLE[tag.toLowerCase()]
      if (!element) return match
      return close ? `</${element.split(' ')[0]}>` : `<${element}>`
    })
    .replace(new RegExp(`\\[\\/?(?:${DROPPED.join('|')})(?:=[^\\]]*)?\\]`, 'gi'), '')
    .replace(BLOCK, '$1')
    .replace(/\n/g, '<br>')

  return html.replace(/\uE000(\d+)\uE000/g, (_, i: string) => literal[Number(i)] ?? '')
}
