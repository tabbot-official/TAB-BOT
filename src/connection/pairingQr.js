import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import { renderHeartQr } from './heartQr.js';

// WhatsApp re-issues the login QR roughly every 20s while unpaired; only the
// latest one is usable, so each event atomically replaces the saved image.
// The QR string itself is a login credential: it is never logged or printed,
// only rendered to a private image inside the data directory.

const QR_FILE = 'pairing-qr.png';
const QR_META = 'pairing-qr.json';

let refreshCount = 0;

export function pairingQrEnabled() {
  return String(process.env.PAIRING_QR || 'on').trim().toLowerCase() !== 'off';
}

export function pairingQrPaths(dataDir) {
  return { png: path.join(dataDir, QR_FILE), meta: path.join(dataDir, QR_META) };
}

export async function savePairingQr(qr, dataDir, log = () => {}) {
  if (!qr || typeof qr !== 'string') return { ok: false, why: 'empty' };
  if (!pairingQrEnabled()) return { ok: false, why: 'disabled' };
  const { png, meta } = pairingQrPaths(dataDir);
  await fs.mkdir(dataDir, { recursive: true });
  let buf;
  if (String(process.env.PAIRING_QR_STYLE || 'heart').trim().toLowerCase() === 'plain') buf = null;
  else { try { buf = await renderHeartQr(qr, 1024); } catch { buf = null; } } // any render problem falls back to the plain QR
  if (!buf) buf = await QRCode.toBuffer(qr, { type: 'png', width: 512, margin: 2, errorCorrectionLevel: 'M' });
  refreshCount += 1;
  const generatedAt = new Date().toISOString();
  const tmp = png + '.tmp';
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, png); // atomic replace: a reader never sees a partial image
  await fs.writeFile(meta, JSON.stringify({ generatedAt, refresh: refreshCount }, null, 2));
  log('PAIRING QR updated (#' + refreshCount + '), saved to ' + png + ' - scan promptly, it refreshes about every 20s.');
  return { ok: true, png, generatedAt, refresh: refreshCount };
}

export async function clearPairingQr(dataDir) {
  const { png, meta } = pairingQrPaths(dataDir);
  refreshCount = 0;
  await fs.rm(png, { force: true });
  await fs.rm(meta, { force: true });
}
