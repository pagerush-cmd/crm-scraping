export async function takeScreenshot(url: string): Promise<Buffer> {
  const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY
  if (!accessKey) throw new Error('SCREENSHOTONE_ACCESS_KEY não configurado')

  const params = new URLSearchParams({
    access_key:          accessKey,
    url,
    full_page:           'true',
    format:              'jpg',
    image_quality:       '75',
    viewport_width:      '1280',
    viewport_height:     '900',
    block_ads:           'true',
    block_cookie_banners: 'true',
    block_trackers:      'true',
    timeout:             '30',
    navigation_timeout:  '25000',
    delay:               '2',
    cache:               'true',
    cache_ttl:           '86400',
  })

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId  = setTimeout(() => controller.abort(), 35_000)

      const response = await fetch(`https://api.screenshotone.com/take?${params}`, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText)
        throw new Error(`Screenshot failed (${response.status}): ${errText}`)
      }

      return Buffer.from(await response.arrayBuffer())
    } catch (err) {
      console.warn(`[screenshot] Tentativa ${attempt}/3 falhou para ${url}:`, err)
      if (attempt === 3) throw err
      await new Promise((r) => setTimeout(r, attempt * 2000))
    }
  }

  throw new Error('Screenshot falhou após 3 tentativas')
}
