# Changelog

## Tab sandbox (2026-10-24)
- AI-written commands (.agent install / build / repair) no longer run inside the bot. Each use runs in a separate Node process with the permission model on: it can read only its own temp dir and node_modules, write only its temp dir, and has no child processes, workers, native addons, inspector or eval. No .env, auth/ or data/ access; the environment carries no secrets.
- No network by default. A command whose code fetches gets only the bot's guarded https fetch (public addresses only, size-capped, max 10 requests); raw sockets, DNS and plain http stay blocked.
- Limits per run: 30 s wall clock, 10 s CPU, 48 MB heap, 96 MB RSS, 32 MB temp disk, 10 replies; the whole process group is killed on any limit. One run at a time (SANDBOX_MAX_CONCURRENT).
- The import probe of a freshly installed npm package runs in the same sandbox. Built-in pre-tested templates still run in-process. The owner's explicit shell is unchanged (owner only).
- AI: OpenRouter pinned to google/gemma-4-31b-it:free (then nemotron-3-super:free); Groq order gpt-oss-120b -> qwen3.8-27b -> gpt-oss-20b; <think> reasoning is stripped from every reply.

## Tab audit (2026-10-24)
- Fixed: .play/.song/.ytmp3 failed after downloading ("does not match its claimed type": YouTube's m4a is detected as video/mp4). Audio in mp4/webm containers is now sent as audio.
- Fixed: Instagram links of the form instagram.com/<user>/reel/<id>/ were rejected.
- Fixed: replies written for the "/" prefix ("Answer: /riddle answer", "Use /menu", owner login code) now show the real prefix.
- Fixed: untouched .env.example placeholders (your-...-key) are treated as unset, so commands say "not set up" instead of "key rejected".
- Fixed: the temp sweep deleted the sticker font config after 10 minutes and never removed old sticker/gitclone/mediafire/mega folders.
- New: .soundcloud (yt-dlp). Audio-only items on SoundCloud/Mixcloud-style platforms now go down the audio path. .alive = .ping. Pack .level renamed .mylevel.
- TikTok: when the tikwm API fails, the video is fetched with yt-dlp instead.
- Memory (308 MB servers): backup YouTube downloads stream to disk; download RAM gate and default max video height (720p under 512 MB) follow the container limit; tab-start.cjs caps the V8 semi-space (TAB_SEMI_MB, default 8).
- Keyless AI waits for the provider's "retry after" instead of failing a second question within 30 s.
- Downloads: a non-link is rejected before it waits in the queue.
- Removed pack duplicates that never loaded (wordoftheday, flashcard, ipinfo).
- Dependencies: npm overrides move @vreden/youtube_scraper to axios 1.x and redstar to minimatch 3.1.5 (npm audit: 0 vulnerabilities).

## Tab fork (2026-10-23), based on Jarvis 2.0.0 by nicholas-pp8
- Renamed to Tab (package tab-whatsapp-bot, banner, menu, help and replies). Group wake word: "@tab" or "hey tab".
- Telemetry OFF by default (TELEMETRY=on to opt in). Maintainer suspend/limit directives ignored.
- No default pairing portal (the maintainer's portal never gets your pairing code or hands you a session). No auto-update from the Jarvis repo.
- Added /xvideos downloader (yt-dlp).

## 3.0.0 - "EKSAATH" (20 Oct 2026)

37 features in one combined release (s61 stability pack + s62 feature drop):

- **Stickers**: Telegram pack import (`/telesticker`, incl. video stickers), GIF search to sticker (`/stickersearch`, GIPHY), emoji mixer (`/emojimix`), per-chat auto-sticker (`/autosticker`).
- **Downloads**: MEGA public files (`/mega`, clean-room client, streams to disk), MediaFire (`/mediafire`), GitHub repo zips (`/gitclone`, 30 MB cap).
- **Group safety**: anti-edit (shows the original when someone edits), anti-sticker, anti-media, anti-promote (owner exempt), join-request review (`/joinreq`).
- **Account tools (owner)**: `/privacy` (view/change last seen, online, profile pic, status, read receipts, group adds), auto-bio rotation (`/autobio`), anti-call (`/anticall`), status auto-react (`/statusreact`). All default OFF.
- **Games**: UNO (hands by DM), Werewolf (roles by DM, night actions in DM), virtual pets (`/pet`), mini RPG (`/rpg`), group clans (`/clan`), rank cards with XP (`/rankcard`).
- **Media & fun**: handwriting notes (`/handwrite`, bundled Kalam font), text logos (`/logo`, 6 styles), 33 fancy text styles (`/fancy`), menu image/video (`/setmenuimage`, `/setmenuvideo`).
- **Info & tools**: football scores (`/football`, football-data.org), IP lookup (`/ip`), morse (`/morse`), contacts to VCF (`/vcf`), web inspect with SSRF guard (`/webinspect`), sandboxed code runner (`/runcode`, Piston), numerology (`/numerology`), color swatches (`/colorcode`), about lookup (`/getabout`), device guess (`/getdevice`), auto-react per chat (`/autoreact`), AFK (`/afk`).
- **s61 stability pack**: encrypted session backup every 30 min, anti-logout watchdog, persistent logs, command catch-up queue, unlimited owner downloads (RAM-gated), `/webhook`.

## 2.1.0 (unreleased)

- Hosted website pairing: after you link on the Jarvis site, your bot collects the prepared session once using your number and S-ID (`claimSession`). The server holds it sealed for 30 minutes at most. Opt out with `ecosystem.autoPair: false`. Disclosed in the README privacy section.
- Optional pairing-portal client (`src/ecosystem/pairing.js`): relays the WhatsApp pairing code to the portal page, proves the link, receives your S-ID and sends it to your own chat. Off unless `ecosystem.portalUrl` and `ecosystem.ticket` are set. Disclosure in the README telemetry section.
- `/sid` also shows the portal S-ID.

## 2.0.0

- Local JSON API with owner dashboard, commands/plugins/AI layer and an Ask Jarvis assistant.
- Anonymous install ping with hosting type, S-ID, signed maintainer directives, /feedback and optional portal S-ID hash. Everything is listed in the README telemetry section; `TELEMETRY=off` turns it off.
- Paste-free portal pairing: `/pair CODE` (owner only) or a code typed at first start / `PORTAL_CODE`; the bot stores the ticket itself in data/ecosystem-ticket.json and defaults to the official portal URL. Nothing is sent before a code is entered.
- Status beat for paired installs (version, hosting type, uptime, commands today, memory; S-ID + install key; every 5 min while connected). Opt out: `ecosystem.statusBeat: false` or `STATUS_BEAT=off`. Disclosed in the README.
- Maintainer-only `/pair <number>` makes a one-time pairing code for another number (owner only, needs the maintainer env).
- Maintainer-only heartbeat to the portal while WhatsApp is connected (off unless PORTAL_URL and PORTAL_PROOF_KEY are set). Sends the bot version only.
- New commands: /queue, /history, /limits, /backup, /crashes. Did-you-mean for mistyped commands, more download error messages, stock and cricket fallbacks, group intro, crash-loop guard.
- `settings.js` gains `ecosystem.sid` and `ecosystem.number`.

## Provider and phone-info update

- Explicit CodeFormer/SnapEdit adapters with bounded images, strict output hosts, daily provider quota/no paid fallback, and durable usage.
- Owner-only private `/truecaller` with Veriphone/IPQS/DataCrawler basic fields and coarse reported regions, per-number confirmation, free hard caps.
-170local tests,109registered commands. Synthetic real adapter tests pass; no human-face quality guarantee.

## 1.6.4

- Resolve WhatsApp LID senders through Baileys phone-number mapping before owner-only command checks. Unmapped LIDs fail closed; group checks use the participant identity.
- Five added identity tests; 145 tests pass. Live owner photo delivery still needs verification.

## 1.6.3

- /remini local Sharp processing and gated Clipdrop/PixelBin/Replicate adapters, bounded images and durable attempt budgets. External providers disabled until configured and cleared.
- Name-based APK numbered choices,2minute chat/sender selection and package-ID /apkdownload support.
- Social formats with missing height metadata now supported, actual output duration/resolution verified and oversized videos downscaled.

## 1.6.2

- Public Instagram, Facebook and Twitter/X video commands with strict post URLs, cookies disabled, queue and limits.
- F-Droid app-name search, metadata and direct recommended APK delivery with bounded HTTPS requests, package structure checks, SHA-256 report and temporary cleanup.
- APK hashes are computed, not cryptographically trusted index comparisons; no malware-free claim. Proprietary sources remain unsupported.

## 1.6.1

- Separate228-key runtime text schema,69 translated non-English files plus English;7 core languages retain runtime English fallback.
- Local typed input guidance, group/game/reminder/ops text migration; custom content preserved.
- Strict locale JSON updater validation and locale-aware standalone rollback.
- No change to English joke/fact/trivia/word corpora.

# v1.6.0

- Virtual economy with reviewed transfers, durable anti-abuse checks and private pseudonymous history.
- Sanitized error IDs, recurrence diagnostics and bounded safe-read retry.
- 76 non-English 164-key dictionaries plus English; 7847-code versioned registry and explicit fallback. Legacy replies remain partly English.
- Fix owner self-chat checks for typed WhatsApp PN/LID identities.
- Preserve corrupt settings files and refuse unpersisted language/sudo/prefix success.

# v1.5.3

- Restore image backend with integrity-checked locked Sharp prebuilt packages only and runtime smoke verification.
- Cache bounded document/audio metadata and resolve wrapped or omitted PDF/file quotes in same chat.

# v1.5.2

- Fix HEAD latency endpoint and return useful network failure text.
- Allow sudo private commands in actual inbound PN/LID DMs without confusing destination and sender.
- Report central cooldown rather than silently dropping commands.
- Clarify HTML command expects a public URL, not inline markup.

# v1.5.1

- Fix sudo add/remove in owner self-chat: accept explicit international numbers with or without +, retain real single-mention support.
- No reply-target inference; reject malformed/multiple inputs.

# v1.5.0

- Add 12 offline fun/game commands with bounded sessions and pseudonymous leaderboard.
- Add persistent sudo membership, owner-only membership management, audit log, and permission middleware.
- Isolate sudo private reminders; allow password/update from operator private DMs.
- Add quick host HTTPS latency only; no Ookla or full bandwidth test.
- Preserve group admin checks and byte-exact launcher regression validation.


## 1.4.0

- Fourteen validated utility commands: safe files/archives, private passwords, reviewed persistent self-reminders, system, web metadata/text, ASCII/PDF, timezone/date tools.
- Three-second utility cooldown, content type checks and bounded memory operations.
- Optional JSON-only group storage skips native SQLite probes on constrained hosts.

## 1.3.0

- Owner self-chat health alerts and daily checks, with conservative cooldowns.
- Private aggregate usage counts, owner favorites and weekly insights.
- Owner-only `/update` with fixed-repo commit review, confirmation, source staging and rollback.
- `/qr <text or URL>` creates a 1024px PNG in memory.
- Periodic expired recover-cache and abandoned temp-job cleanup. Active jobs, auth, settings and Neha are never cleaned.

## 1.2.0

- TTS and voice list with 23 languages.
- Profile-picture validation fixes.
- Recover switches default ON, with explicit later OFF settings preserved.

## Combined brain + multiplayer games
- Shared sessions,17new brain commands,10multiplayer rule modules, invites/turns/timers/cleanup.
- Preserve existing quiz/jumble/wordgame and solo TTT; extend TTT challenges and economy leaderboard with `games` argument.
- Atomic JSON XP/profiles/streaks/achievements after owner-selected JSON fallback; native SQLite host probe SIGSEGV, not enabled.
- Fix downloaded-video delivery: convert to H.264/AAC/yuv420p faststart MP4, decode-check and enforce actual post-conversion size before send; block corrupt files.
