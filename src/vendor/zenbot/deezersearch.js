/*
 * © Created by AxelDev09 🔥
 * GitHub: https://github.com/AxelDev09
 * Instagram: @axeldev09
 * Deja los créditos we 🗣️
 * Vendored into TAB BOT from @soyaxell09/zenbot-scraper v1.1.9 (MIT, see LICENSE in this folder).
 */

import axios from 'axios'

const UA   = 'Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const BASE = 'https://api.deezer.com'

async function get(endpoint, params = {}) {
  const { data } = await axios.get(`${BASE}${endpoint}`, {
    params,
    headers: { 'User-Agent': UA },
    timeout: 12000,
  })
  if (data?.error) throw new Error(data.error.message || 'Error en Deezer API')
  return data
}

function formatDuration(ms) {
  if (!ms) return null
  const s   = Math.floor(ms / 1000)
  const m   = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export async function deezerFind(query, limit = 10) {
  if (!query?.trim()) throw new Error('Se requiere un término de búsqueda')
  const data = await get('/search', { q: query, limit })
  if (!data?.data?.length) throw new Error('Sin resultados')
  return data.data.map(t => ({
    id:       t.id,
    title:    t.title,
    artist:   t.artist?.name,
    artistId: t.artist?.id,
    album:    t.album?.title,
    albumId:  t.album?.id,
    cover:    t.album?.cover_medium,
    coverHd:  t.album?.cover_xl || t.album?.cover_big,
    preview:  t.preview,
    duration: formatDuration(t.duration * 1000),
    link:     t.link,
    rank:     t.rank,
  }))
}

export async function deezerSearchAlbum(query, limit = 10) {
  if (!query?.trim()) throw new Error('Se requiere un término de búsqueda')
  const data = await get('/search/album', { q: query, limit })
  if (!data?.data?.length) throw new Error('Sin resultados')
  return data.data.map(a => ({
    id:          a.id,
    title:       a.title,
    artist:      a.artist?.name,
    artistId:    a.artist?.id,
    cover:       a.cover_medium,
    coverHd:     a.cover_xl || a.cover_big,
    tracks:      a.nb_tracks,
    releaseDate: a.release_date,
    link:        a.link,
  }))
}

export async function deezerSearchArtist(query, limit = 10) {
  if (!query?.trim()) throw new Error('Se requiere un término de búsqueda')
  const data = await get('/search/artist', { q: query, limit })
  if (!data?.data?.length) throw new Error('Sin resultados')
  return data.data.map(a => ({
    id:      a.id,
    name:    a.name,
    picture: a.picture_medium,
    pictureHd: a.picture_xl || a.picture_big,
    fans:    a.nb_fan,
    link:    a.link,
  }))
}

export async function deezerAlbumTracks(albumId, limit = 50) {
  if (!albumId) throw new Error('Se requiere un ID de álbum')
  const data = await get(`/album/${albumId}/tracks`, { limit })
  if (!data?.data?.length) throw new Error('Sin tracks')
  const album = await get(`/album/${albumId}`)
  return {
    id:          album.id,
    title:       album.title,
    artist:      album.artist?.name,
    cover:       album.cover_medium,
    coverHd:     album.cover_xl || album.cover_big,
    releaseDate: album.release_date,
    genre:       album.genres?.data?.[0]?.name || null,
    tracks:      data.data.map(t => ({
      id:       t.id,
      title:    t.title,
      duration: formatDuration(t.duration * 1000),
      preview:  t.preview,
      link:     `https://www.deezer.com/track/${t.id}`,
    }))
  }
}

export async function deezerArtistTopTracks(artistId, limit = 10) {
  if (!artistId) throw new Error('Se requiere un ID de artista')
  const data = await get(`/artist/${artistId}/top`, { limit })
  if (!data?.data?.length) throw new Error('Sin tracks')
  const artist = await get(`/artist/${artistId}`)
  return {
    id:        artist.id,
    name:      artist.name,
    picture:   artist.picture_medium,
    pictureHd: artist.picture_xl || artist.picture_big,
    fans:      artist.nb_fan,
    link:      artist.link,
    tracks:    data.data.map(t => ({
      id:       t.id,
      title:    t.title,
      album:    t.album?.title,
      cover:    t.album?.cover_medium,
      duration: formatDuration(t.duration * 1000),
      preview:  t.preview,
      rank:     t.rank,
      link:     `https://www.deezer.com/track/${t.id}`,
    }))
  }
}
