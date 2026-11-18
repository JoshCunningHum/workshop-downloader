import { describe, expect, it } from 'vitest'
import { bbcodeToHtml } from '~/utils/bbcode'

describe('bbcodeToHtml', () => {
  it('renders formatting, headings and lists', () => {
    expect(bbcodeToHtml('[h1]Title[/h1]\n[b]bold[/b] and [i]it[/i]\n[list]\n[*]one\n[*]two\n[/list]'))
      .toBe('<h4>Title</h4><strong>bold</strong> and <em>it</em><ul><li>one<li>two</ul>')
  })

  it('escapes HTML in the text', () => {
    expect(bbcodeToHtml('<script>alert(1)</script> & "x"')).toBe('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;')
  })

  it('links and images keep http(s) URLs only', () => {
    expect(bbcodeToHtml('[url=https://a.example/x]a[/url] [url=javascript:alert(1)]b[/url]'))
      .toBe('<a href="https://a.example/x">a</a> <a>b</a>')
    expect(bbcodeToHtml('[url]https://a.example[/url]')).toBe('<a href="https://a.example">https://a.example</a>')
    expect(bbcodeToHtml('[img]data:x[/img][img]https://i.example/p.png[/img]'))
      .toBe('<img src="https://i.example/p.png" alt="" loading="lazy">')
  })

  it('keeps code and noparse literal, turns newlines into breaks', () => {
    expect(bbcodeToHtml('a\nb [noparse][b]x[/b][/noparse]')).toBe('a<br>b [b]x[/b]')
    expect(bbcodeToHtml('[code][i]x[/i][/code]')).toBe('<pre><code>[i]x[/i]</code></pre>')
  })

  it('drops tags it does not render and leaves unknown brackets alone', () => {
    expect(bbcodeToHtml('[previewyoutube=abc;full][/previewyoutube]v[1.2] [foo]')).toBe('v[1.2] [foo]')
  })
})
