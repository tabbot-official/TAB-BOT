import {validateLocales} from './i18n/validate.js';
import {start as startOps,stop as stopOps,recordError} from './ops/index.js';
import {onError} from './utils/logger.js';
import config from './config/config.js';
import logger from './utils/logger.js';
import { ensureDirs, cleanupStaleJobs } from './utils/fileManager.js';
import { initDatabase } from './database/database.js';
import {bootSelfTest} from './ops/selftest.js';
import {checkFfmpegHls} from './ops/ffmpegCheck.js';
import { loadCommands,registry,commandLoadFailures } from './handlers/commandHandler.js';
import { startWhatsApp, shutdown } from './connection/whatsapp.js';
import { recordCrash, readCrashes, loopDelayMs } from './ops/crashlog.js';
import { acquireLock, releaseLock } from './utilities/instancelock.js';
import { restoreIfNeeded, startAuthBackup } from './utilities/authbackup.js';

async function main() {
  try { await (await import('./utilities/updateguard.js')).onBootStart(); } catch (e) { logger.error('[updateguard] boot check failed:', e); }
  if (!acquireLock({ log: (m) => logger.warn(m) })) { logger.error('Another Tab instance is already running (lock held). Refusing to start a second one - two instances would fight over the WhatsApp session.'); process.exit(1); }
  try { await (await import('./utils/banner.js')).playBanner({ name: config.botName }); } catch {}
  logger.info(`Starting ${config.botName} (prefix "${config.prefix}", auto status view ${config.autoStatusView ? 'on' : 'off'})`);
  await ensureDirs();
  await initDatabase();
  await loadCommands();
  const languages=validateLocales();logger.info(`[i18n] registry ${languages.registered}; complete schema ${languages.complete}; partial ${languages.partial}; missing keys fall back to English`);
  const checks=bootSelfTest(registry,commandLoadFailures);if(checks.failed.length)throw new Error('Startup self-test failed: '+checks.failed.join(', '));
  checkFfmpegHls().then((r)=>{if(r.ok)logger.info('[self-test] ffmpeg HLS ok ('+r.detail+')');else logger.error('[self-test] ffmpeg HLS check FAILED: '+r.detail+' - HLS video downloads (Pinterest etc.) will not work');}).catch(()=>{});
  try { (await import('./utils/banner.js')).bootBox([['Commands', registry.list().length], ['Self-test', checks.pass + ' passed / ' + checks.failed.length + ' failed'], ['Locale keys', languages.registered], ['Prefix', config.prefix]]); } catch {}
  await cleanupStaleJobs(0); // anything left in temp from a previous run is abandoned
  setInterval(() => cleanupStaleJobs(), 10 * 60 * 1000).unref();
  onError(recordError);startOps();
  try { (await import('./services/ytdlpUpdate.js')).startYtDlpUpdater(); } catch (e) { logger.warn('[ytdlp-update] not started: ' + e.message); }
  try { (await import('./dashboard/server.js')).startDashboard(registry); } catch (e) { logger.warn('[dashboard] not started: ' + e.message); }
  try { (await import('./api/server.js')).startApi(registry); } catch (e) { logger.warn('[api] not started: ' + e.message); }
  try { (await import('./telemetry/index.js')).startTelemetry(); } catch (e) { logger.warn('[telemetry] not started: ' + e.message); }
  try { (await import('./utils/banner.js')).startTicker(); } catch {}
  restoreIfNeeded(); // only acts when the session files are missing/corrupt
  startAuthBackup();
  await startWhatsApp();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
// Fatal runtime failures restart only Tab via its host supervisor.
process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => {logger.error('Uncaught exception:', err);recordCrash(err);stopOps();shutdown(1);});

{ const wait = loopDelayMs(readCrashes()); if (wait) { logger.warn(`Several crashes in a row. Waiting ${wait / 1000}s before starting again.`); await new Promise((r) => setTimeout(r, wait)); } }
main().catch((err) => {
  logger.error('Fatal startup error:', err);
  recordCrash(err);
  process.exit(1);
});
