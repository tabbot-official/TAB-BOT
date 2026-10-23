// Vendored into TAB BOT from @soyaxell09/zenbot-scraper v1.1.9 by AxelDev09 (MIT, see LICENSE in this folder).
// Parchado y modificado por AxelDev09
// scraper creado por FG-ERROR

import axios from 'axios'

const delay = ms => new Promise(r => setTimeout(r, ms))

function parseFileSize(size) {
  if (!size) return 0
  const units = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }
  const match = size.toString().trim().match(/([\d.]+)\s*(B|KB|MB|GB|TB)/i)
  if (!match) return 0
  return Math.round(parseFloat(match[1]) * (units[match[2].toUpperCase()] || 1))
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++ }
  return `${bytes.toFixed(1).replace(/\.0$/, '')} ${units[i]}`
}

export async function getFileSize(url) {
  try {
    const res   = await axios.head(url, { timeout: 10000 })
    const bytes = parseInt(res.headers['content-length'] || 0)
    return formatFileSize(bytes)
  } catch { return '0 B' }
}

function normalizeYT(url) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return url
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.includes('/watch'))   return `https://youtu.be/${u.searchParams.get('v')}`
      if (u.pathname.includes('/shorts/')) return `https://youtu.be/${u.pathname.split('/shorts/')[1]}`
      if (u.pathname.includes('/embed/'))  return `https://youtu.be/${u.pathname.split('/embed/')[1]}`
    }
    return url
  } catch { return url }
}

async function waitForDownload(mediaUrl) {
  for (let i = 0; i < 15; i++) {
    try {
      const { data } = await axios.get(mediaUrl, { timeout: 15000 })
      if (data?.percent === 'Completed' && data?.fileUrl && data.fileUrl !== 'In Processing...')
        return data.fileUrl
    } catch {}
    await delay(4000)
  }
  throw new Error('No se pudo generar el enlace de descarga')
}

async function fetchYtdownto(url) {
  const { data } = await axios.post(
    'https://app.ytdown.to/proxy.php',
    new URLSearchParams({ url }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20000,
    }
  )
  const api = data?.api
  if (!api)                   throw new Error('No se pudo obtener información del video')
  if (api.status === 'ERROR') throw new Error(api.message)

  const qualities = (api.mediaItems || []).map((v, i) => {
    const match = v?.mediaUrl?.match(/(\d+)p|(\d+)k/)
    const res   = match ? match[0] : v.mediaQuality
    return {
      id:       i + 1,
      type:     v.type,
      quality:  res,
      label:    `${v.mediaExtension?.toUpperCase()} - ${v.mediaQuality}`,
      size:     v.mediaFileSize,
      sizeB:    parseFileSize(v.mediaFileSize),
      mediaUrl: v.mediaUrl,
      duration: v.mediaDuration,
    }
  })

  return { api, qualities }
}

export async function ytDownload(url, type = 'video', quality = '360p') {
  url = normalizeYT(url)

  const { api, qualities } = await fetchYtdownto(url)

  const isAudio  = type === 'mp3' || type === 'audio'
  const targetQ  = quality.toLowerCase()

  const filtered = isAudio
    ? qualities.filter(v => v.type === 'audio' || v.quality?.includes('k'))
    : qualities.filter(v => v.type === 'video' || v.quality?.includes('p'))

  if (!filtered.length) {
    const disponibles = qualities.map(v => v.quality).filter(Boolean).join(', ')
    throw new Error(`Calidad ${quality} no disponible. Disponibles: ${disponibles}`)
  }

  let selected
  if (isAudio) {
    const mp3s = filtered.filter(v => v.label?.toLowerCase().includes('mp3'))
    const pool = mp3s.length ? mp3s : filtered
    const exact = pool.find(v => v.quality?.toLowerCase() === targetQ)
    if (exact) {
      selected = exact
    } else {
      selected = pool.sort((a, b) => {
        const qa = parseInt(a.quality) || 0
        const qb = parseInt(b.quality) || 0
        return qb - qa
      })[0]
    }
  } else {
    selected = filtered.find(v => v.quality?.toLowerCase() === targetQ) || filtered[0]
  }

  if (!selected) {
    const disponibles = qualities.map(v => v.quality).filter(Boolean).join(', ')
    throw new Error(`Calidad ${quality} no disponible. Disponibles: ${disponibles}`)
  }

  const dlUrl = await waitForDownload(selected.mediaUrl)

  return {
    title:    api.title,
    uploader: api.userInfo?.name || '',
    views:    api.mediaStats?.viewsCount || '',
    thumb:    api.imagePreviewUrl || '',
    type:     isAudio ? 'audio' : 'video',
    quality:  selected.quality,
    size:     selected.size,
    sizeB:    selected.sizeB,
    duration: selected.duration,
    url:      dlUrl,
  }
}

export async function ytInfo(url) {
  url = normalizeYT(url)
  const { api, qualities } = await fetchYtdownto(url)
  const duration = qualities[0]?.duration || ''
  const id = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)?.[1] || ''
  return {
    id,
    title:    api.title,
    uploader: api.userInfo?.name || '',
    views:    api.mediaStats?.viewsCount || '',
    thumb:    api.imagePreviewUrl || '',
    duration,
    qualities,
  }
}

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1'
let _config = null

async function getConfig() {
  if (_config) return _config
  const res = await axios.get('https://www.youtube.com/', {
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept':          'text/html,application/xhtml+xml',
    },
    timeout: 15000,
  })
  const html          = res.data
  const key           = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/)?.[1] || 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM394'
  const visitorData   = html.match(/"visitorData"\s*:\s*"([^"]+)"/)?.[1] || ''
  const clientVersion = html.match(/"clientVersion"\s*:\s*"([^"]+)"/)?.[1] || '2.20240101.00.00'
  _config = { key, visitorData, clientVersion }
  return _config
}

export async function ytSearch(query, limit = 5) {
  const cfg = await getConfig()
  const res = await axios.post(
    `${INNERTUBE_URL}/search?key=${cfg.key}&prettyPrint=false`,
    {
      query,
      context: {
        client: {
          clientName:    'WEB',
          clientVersion: cfg.clientVersion,
          hl: 'en', gl: 'US',
          visitorData:   cfg.visitorData,
        },
      },
    },
    {
      headers: {
        'User-Agent':               'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name':    '1',
        'X-YouTube-Client-Version': cfg.clientVersion,
        'Content-Type':             'application/json',
        'X-Goog-Visitor-Id':        cfg.visitorData,
      },
      timeout: 15000,
    }
  )

  const contents =
    res.data?.contents
      ?.twoColumnSearchResultsRenderer
      ?.primaryContents
      ?.sectionListRenderer
      ?.contents?.[0]
      ?.itemSectionRenderer
      ?.contents || []

  const results = []
  for (const item of contents) {
    if (results.length >= limit) break
    const v = item?.videoRenderer
    if (!v?.videoId) continue
    results.push({
      id:        v.videoId,
      title:     v.title?.runs?.[0]?.text || '',
      url:       `https://www.youtube.com/watch?v=${v.videoId}`,
      thumbnail: v.thumbnail?.thumbnails?.at(-1)?.url || '',
      duration:  v.lengthText?.simpleText || '',
      views:     v.viewCountText?.simpleText || '',
      channel:   v.ownerText?.runs?.[0]?.text || '',
      published: v.publishedTimeText?.simpleText || '',
    })
  }

  if (!results.length) throw new Error('Sin resultados')
  return results
}
