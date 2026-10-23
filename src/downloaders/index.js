import { parseHttpUrl } from '../utils/helpers.js';
import { DownloadError } from '../utils/downloader.js';
import * as youtube from './youtube.js';
import * as pinterest from './pinterest.js';
import {makeSocial} from './social.js';
import {platformDownloaders} from './platforms.js';

/**
 * Registry of platform downloaders. To add a platform, create a module that
 * exports { name, matches(url), download(url, { kind, dir }) } and add it here.
 */
export const downloaders = [youtube, pinterest,...['instagram','facebook','twitter'].map(makeSocial),...platformDownloaders];

export function detectPlatform(rawUrl) {
  const url = parseHttpUrl(rawUrl);
  if (!url) return { url: null, downloader: null };
  return { url, downloader: downloaders.find((d) => d.matches(url)) || null };
}

/**
 * Validates the URL, routes it to the right downloader and returns
 * { title, files: [{ path, type, mimetype, fileName }] }.
 * `expect` restricts which platform a command accepts.
 */
export async function fetchMedia(rawUrl, { dir, kind, expect, onProgress }) {
  const { url, downloader } = detectPlatform(rawUrl);
  if (!url) throw new DownloadError('❌ Please send a valid link starting with https://', { code: 'INVALID' });
  if (!downloader) throw new DownloadError('❌ That website is not supported yet.', { code: 'UNSUPPORTED' });
  if (expect && downloader.name !== expect) {
    throw new DownloadError(`❌ That is not a ${expect} link.`, { code: 'UNSUPPORTED' });
  }
  return downloader.download(url, { dir, kind, onProgress });
}
