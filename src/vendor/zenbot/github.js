/*
 * © Created by AxelDev09 🔥
 * GitHub: https://github.com/AxelDev09
 * Instagram: @axeldev09
 * Deja los créditos we 🗣️
 * Vendored into TAB BOT from @soyaxell09/zenbot-scraper v1.1.9 (MIT, see LICENSE in this folder).
 */

import axios from 'axios'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept':     'application/vnd.github.v3+json',
}

function parseRepo(input) {
  const m = input.match(/github\.com\/([^/]+\/[^/]+)/)
  if (m) return m[1].replace(/\.git$/, '')
  if (/^[^/]+\/[^/]+$/.test(input)) return input
  return null
}

async function get(url) {
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 })
  return res.data
}

export async function githubInfo(repo) {
  const r = parseRepo(repo)
  if (!r) throw new Error('Repo inválido. Usá owner/repo o URL de GitHub')

  const data = await get(`https://api.github.com/repos/${r}`)

  return {
    name:        data.name,
    fullName:    data.full_name,
    description: data.description || '',
    url:         data.html_url,
    stars:       data.stargazers_count,
    forks:       data.forks_count,
    watchers:    data.watchers_count,
    issues:      data.open_issues_count,
    language:    data.language || '',
    license:     data.license?.name || '',
    topics:      data.topics || [],
    private:     data.private,
    fork:        data.fork,
    createdAt:   data.created_at,
    updatedAt:   data.updated_at,
    pushedAt:    data.pushed_at,
    size:        data.size,
    defaultBranch: data.default_branch,
    owner: {
      login:  data.owner?.login || '',
      avatar: data.owner?.avatar_url || '',
      url:    data.owner?.html_url || '',
      type:   data.owner?.type || '',
    },
    cloneUrl: data.clone_url,
    sshUrl:   data.ssh_url,
    zipUrl:   `https://github.com/${r}/archive/refs/heads/${data.default_branch}.zip`,
  }
}

export async function githubRelease(repo) {
  const r = parseRepo(repo)
  if (!r) throw new Error('Repo inválido')

  const data = await get(`https://api.github.com/repos/${r}/releases/latest`)

  return {
    tag:         data.tag_name,
    name:        data.name || data.tag_name,
    body:        data.body || '',
    draft:       data.draft,
    prerelease:  data.prerelease,
    createdAt:   data.created_at,
    publishedAt: data.published_at,
    url:         data.html_url,
    tarball:     data.tarball_url,
    zipball:     data.zipball_url,
    assets: (data.assets || []).map(a => ({
      name:        a.name,
      size:        a.size,
      downloadUrl: a.browser_download_url,
      downloads:   a.download_count,
      contentType: a.content_type,
    })),
  }
}

export async function githubContents(repo, path = '') {
  const r = parseRepo(repo)
  if (!r) throw new Error('Repo inválido')

  const url  = path
    ? `https://api.github.com/repos/${r}/contents/${path}`
    : `https://api.github.com/repos/${r}/contents`
  const data = await get(url)

  if (Array.isArray(data)) {
    return data.map(f => ({
      name:     f.name,
      path:     f.path,
      type:     f.type,
      size:     f.size,
      url:      f.html_url,
      download: f.download_url || null,
      sha:      f.sha,
    }))
  }

  return {
    name:     data.name,
    path:     data.path,
    type:     data.type,
    size:     data.size,
    url:      data.html_url,
    download: data.download_url,
    content:  data.encoding === 'base64' ? Buffer.from(data.content, 'base64').toString('utf-8') : data.content,
    sha:      data.sha,
  }
}

export async function githubSearch(query, type = 'repositories', limit = 5) {
  const validTypes = ['repositories', 'users', 'code', 'issues']
  if (!validTypes.includes(type)) throw new Error('Tipo inválido. Usá: ' + validTypes.join(', '))

  const data = await get(
    `https://api.github.com/search/${type}?q=${encodeURIComponent(query)}&per_page=${limit}`
  )

  const items = data.items || []

  if (type === 'repositories') {
    return items.map(r => ({
      name:        r.full_name,
      description: r.description || '',
      url:         r.html_url,
      stars:       r.stargazers_count,
      forks:       r.forks_count,
      language:    r.language || '',
      updatedAt:   r.updated_at,
    }))
  }

  if (type === 'users') {
    return items.map(u => ({
      login:  u.login,
      url:    u.html_url,
      avatar: u.avatar_url,
      type:   u.type,
    }))
  }

  return items.slice(0, limit)
}
