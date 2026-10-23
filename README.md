# Tab WhatsApp Bot

**Tab is based on Jarvis by nicholas-pp8** (https://github.com/nicholas-pp8/jarvis-whatsapp-bot), MIT License. The original copyright notice is kept in `LICENSE`.

What is different in Tab:

- Name: the bot calls itself Tab (banner, menu, help, replies). In groups, call it with `@tab` or `hey tab` (plain "tab" is a normal Hindi word, so it is ignored).
- Telemetry and signed maintainer suspend/limit directives follow original Jarvis defaults: **ON**. The original maintainer receives anonymous install pings and can remotely suspend or rate-limit this install. Set `TELEMETRY=off` and `MAINTAINER_DIRECTIVES=off` to disable them.
- The original Jarvis pairing portal (`https://3-110-115-23.sslip.io/portal`) is restored; a portal code/ticket is needed before pairing data is sent there.
- Hourly auto-update from Jarvis remains OFF to protect Tab branding and added commands (set `UPDATE_REPO` only to a repository you control).
- No auto-update from the Jarvis GitHub repo (it would overwrite Tab). `UPDATE_REPO=owner/repo` only for a repo you control.
- 18+ command `.xvideos`: `.xvideos <words>` searches XVideos, XNXX, Pornhub and xHamster at once, `.xvideos <number>` downloads a result from your last search, `.xvideos <link>` downloads a video (up to 16 MB as video, larger as a file, 100 MB max).
  - Private chat: anyone who messages the bot can use it.
  - Groups: **off by default** (groups can have minors). A group admin, or the bot owner, turns it on for that group with `.xvideos on` and off with `.xvideos off`; once on, any member can use it. The setting is saved per group with the other group settings.
  - The owner can switch it off everywhere with `.platformdisable xvideos` (`.platformenable xvideos` turns it back on).
- `.threads <link>` reads the post page itself first (every video/photo of the post, carousels too) and falls back to sssthreads; a profile picture is never sent as the result.
- `.vv` / `.vvn` (owner): reply to a view-once photo/video (`.vv`) or voice note (`.vvn`) and the bot downloads it straight from the replied message, even if it was not saved when it arrived. Works with `viewOnceMessage`, `viewOnceMessageV2`, `viewOnceMessageV2Extension` and the `viewOnce: true` flag.
- Node 22 or newer (link-preview-js 5 needs it).
- Environment variable names still start with `JARVIS_` (for example `JARVIS_AUTH_BACKUP_KEY`) so old `.env` files keep working.

The documentation below is the original Jarvis documentation. Wherever it says "Jarvis", read "Tab".

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&height=230&color=gradient&customColorList=12,20,24&text=JARVIS&fontSize=84&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=The%20free%20WhatsApp%20assistant%20bot&descAlignY=60&descSize=22" alt="JARVIS banner" width="100%" />

<img src="assets/logo.png" width="150" alt="Jarvis logo" />

<a href="https://jarvis-wa-bot.netlify.app">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=24&pause=1100&color=3DDCFF&center=true&vCenter=true&width=700&lines=%F0%9F%A4%96+2000%2B+commands+in+one+chat;%F0%9F%A7%A0+AI+answers+with+%2Fask;%F0%9F%8E%B5+Music+and+video+downloads;%F0%9F%8E%A8+Stickers+and+image+tools;%F0%9F%8E%AE+Games%2C+XP+and+a+virtual+economy;%F0%9F%9B%A1%EF%B8%8F+Full+group+management;%F0%9F%93%8A+Live+owner+dashboard" alt="Typing animation" />
</a>

<p>
  <a href="https://jarvis-wa-bot.netlify.app"><img src="https://img.shields.io/badge/%F0%9F%8C%90_Live_website-open-3DDCFF?style=for-the-badge&labelColor=0b1c2c" alt="Website" /></a>
  <img src="https://img.shields.io/badge/Node.js-20%2B-3DDCFF?style=for-the-badge&logo=node.js&logoColor=white&labelColor=0b1c2c" alt="Node" />
  <img src="https://img.shields.io/badge/Baileys-7.0-3DDCFF?style=for-the-badge&logo=whatsapp&logoColor=white&labelColor=0b1c2c" alt="Baileys" />
  <img src="https://img.shields.io/badge/commands-2000%2B-3DDCFF?style=for-the-badge&labelColor=0b1c2c" alt="Commands" />
  <img src="https://img.shields.io/badge/price-free-22c55e?style=for-the-badge&labelColor=0b1c2c" alt="Free" />
  <img src="https://img.shields.io/badge/license-MIT-3DDCFF?style=for-the-badge&labelColor=0b1c2c" alt="License" />
</p>

<h3>
  <a href="https://jarvis-wa-bot.netlify.app">🌐 Website</a> •
  <a href="#install">🚀 Install</a> •
  <a href="#commands">📖 Commands</a> •
  <a href="#telemetry-anonymous-install-ping">🔒 Privacy</a> •
  <a href="#ban-risk-notes">⚠️ Ban notes</a>
</h3>

<p><b>A modular WhatsApp bot with downloaders, AI chat, image tools, games and group management.</b><br/>Pairing-code login, no QR. Free and open source.</p>

<a href="https://jarvis-wa-bot.netlify.app">
  <img src="assets/1-site-preview.gif" width="720" alt="Animated preview of the JARVIS website. Click to open it." />
</a>
<br/><sub>👆 Click the preview to open the live website</sub>

<br/><br/>

<img src="assets/demo.gif" width="380" alt="Example chat (illustrative)" />

</div>

## ✨ At a glance

<div align="center">

| 🤖 **2000+** | 🗂️ **30+** | 💸 **Free** | ⚡ **~150 MB** |
|:--:|:--:|:--:|:--:|
| commands | categories | no paid plan | typical RAM |

</div>

| | What you get |
|---|---|
| 🧠 | **AI** answers, summaries and an "Ask Jarvis" assistant |
| 🎵 | **Downloaders** for music and video with clear error messages |
| 🎨 | **Image tools**, stickers and enhancement |
| 🎮 | **Games**, XP, quizzes and a virtual economy |
| 🛡️ | **Group admin**: moderation, welcome, anti-spam and more |
| 📊 | **Owner dashboard** with live status and usage |
| 🔌 | **Local API** with random, hashed, revocable keys (off by default) |
| 🔐 | **Open about data**: optional anonymous install ping, easy to turn off |

> [!TIP]
> Prefer a guided tour? The [website](https://jarvis-wa-bot.netlify.app) has a command playground, setup guide, FAQ and changelog. It also installs as an app on your phone.

---

> [!WARNING]
> Baileys is an unofficial WhatsApp client. WhatsApp can restrict or ban numbers that use it, and group tools (mass tagging, adding or removing people, auto moderation) raise that risk. Use a number you can afford to lose. Read [Ban-risk notes](#ban-risk-notes) before turning anything on.

## Features

* **Downloaders**: YouTube audio/video, Pinterest, public Instagram/Facebook/X videos, and F-Droid APK search/info/direct files. See limits and delivery evidence below.
* **AI**: `/ask` talks to Gemini, Groq or OpenRouter, whichever keys you set. It tries them in order and falls back on errors.
* **Text to speech**: `/tts` supports 23 languages, with male/female voices where available using Microsoft Edge voices, with Google Translate as fallback. No API key. Defaults: 500 characters and 5 requests per minute for non-owner users (the owner is exempt). When voice-note conversion fails, it sends plain audio.
* **Phone info**: `/truecaller +COUNTRYNUMBER yes` (alias `/phoneinfo`) combines separate basic provider reports, owner-only/private chat. Explicit number disclosure required; names/regions are unverified, not live location.
* **Image tools**: stickers with your own pack name, sticker to image, resize, compress, convert. Works as a caption or as a reply to media.
* **Group management**: welcome and goodbye messages, rules, warnings with history, anti-link, anti-spam, anti-flood, blocked words, mute, scheduled messages, stats, invite link tools, add/remove/promote/demote.
* **Recover**: deleted messages, deleted and normal statuses, view-once photos, videos and voice notes, profile pictures. Sent to your own chat. See the Recover section below.
* **Permission levels**: bot owner > bot admin > WhatsApp group admin > member.
* **Safe by default**: every automatic group feature is off until a group admin turns it on. Admins are never auto moderated.
* **Crash safe**: errors are caught per message and per group. One bad message never stops the bot. The connection reconnects by itself.
* **Modular**: drop a file into `src/commands/` and it becomes a command. Group tools live in `src/groups/` and plug in without touching the connection code.
* **Live stats** in `/menu` and `/status`: uptime, RAM, CPU, command usage.

## Commands

Current build registers 109 primary commands. Aliases are not counted separately. This list is generated from the current registry; boot imports/schema checks are not end-to-end delivery tests. The default prefix is `/`; change it in `.env`.

### AI (3)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/ask` | Ask an AI anything | `/ai` |
| `/tts` | Turn text into a voice message | `/speak`, `/say` |
| `/ttsvoices` | List voice languages and voices | `/voices` |

### Diagnostics (1)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/errors` | Private error IDs and recurrence counts; no message contents | - |

### Downloaders (10)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/apk` | Find free apps and validated official APKs | - |
| `/apkdownload` | Find free apps and validated official APKs | - |
| `/apkinfo` | Find free apps and validated official APKs | - |
| `/apksearch` | Find free apps and validated official APKs | - |
| `/facebook` | Download a public facebook video | `/fb` |
| `/instagram` | Download a public instagram video | `/ig`, `/insta` |
| `/pinterest` | Find a Pinterest pin by name, or download one from a link | `/pin` |
| `/play` | Download the audio of a YouTube video (M4A) | `/ytaudio`, `/ytmp3`, `/song` |
| `/twitter` | Download a public twitter video | `/x`, `/tweet` |
| `/video` | Download a YouTube video (MP4) | `/ytvideo`, `/ytmp4`, `/yt` |

### Economy (9)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/achievements` | Virtual economy achievements | - |
| `/balance` | Virtual economy balance | - |
| `/daily` | Virtual economy daily | - |
| `/earn` | Virtual economy earn | - |
| `/economy` | Virtual economy economy | - |
| `/economyrules` | Configure virtual earning limits | - |
| `/leaderboard` | Virtual economy leaderboard | - |
| `/pay` | Review and confirm a virtual-coin transfer | - |
| `/profile` | Virtual economy profile | - |

### Games (12)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/8ball` | Playful random answer, not advice | - |
| `/choose` | Pick from 2-10 options | - |
| `/coinflip` | Flip a coin | - |
| `/dice` | Roll one six-sided die | - |
| `/fact` | A simple fact | - |
| `/joke` | A short joke | - |
| `/jumble` | Unscramble a word | - |
| `/poll` | Create a simple group poll | - |
| `/quiz` | Trivia with private sessions and scores | - |
| `/quote` | A short encouraging thought | - |
| `/ttt` | Play tic-tac-toe vs Jarvis | - |
| `/wordgame` | Make words from six letters | - |

### General (4)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/help` | Explain how to use the bot or one command | `/h` |
| `/menu` | Show all commands | `/start`, `/commands` |
| `/ping` | Check that the bot is alive and how fast it replies | - |
| `/setprefix` | Change the command prefix (any symbol, number, letter or emoji) | `/prefix` |

### Group (26)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/add` | Add a person by number (admins) | - |
| `/announce` | Post an announcement (admins) | - |
| `/antiflood` | Turn label_antiflood on or off (admins) | - |
| `/antilink` | Turn label_antilink on or off (admins) | - |
| `/antispam` | Turn label_antispam on or off (admins) | - |
| `/blockword` | Manage blocked words (admins) | `/badword` |
| `/botadmin` | Manage bot admins (owner only) | - |
| `/demote` | Remove admin rights (admins) | - |
| `/goodbye` | Turn label_goodbye on or off (admins) | - |
| `/groupconfig` | View or change group settings (admins) | `/gconfig`, `/gsettings` |
| `/groupinfo` | Show info about this group | `/ginfo` |
| `/grouplink` | Get the invite link (admins) | `/link` |
| `/groupstats` | Message counts and top members | `/gstats` |
| `/mute` | Only admins can send (admins) | - |
| `/promote` | Make someone an admin (admins) | - |
| `/remove` | Remove a person (admins) | `/kick` |
| `/resetwarn` | Clear warnings of a member (admins) | `/clearwarn` |
| `/revoke` | Reset the invite link (admins) | `/resetlink` |
| `/rules` | Show the group rules | - |
| `/schedule` | Daily scheduled message (admins) | - |
| `/setrules` | Set the group rules (admins) | - |
| `/tagall` | Mention everyone once (admins, 10 min cooldown) | `/everyone` |
| `/unmute` | Everyone can send (admins) | - |
| `/warn` | Warn a member (admins) | - |
| `/warnings` | Show warnings of a member | `/warns` |
| `/welcome` | Turn label_welcome on or off (admins) | - |

### Image (11)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/compress` | Make an image smaller in file size | `/shrink` |
| `/convert` | Convert an image to png, jpg or webp | `/toformat` |
| `/denoise` | Reduce noise locally with Sharp | - |
| `/qr` | Generate a PNG QR code | - |
| `/remini` | Enhance/upscale a photo; local baseline or configured provider | `/enhance` |
| `/resize` | Resize an image to a width in pixels | - |
| `/restore` | Restore faces using an approved external provider | - |
| `/sharpen` | Sharpen a photo locally with Sharp | - |
| `/sticker` | Make a sticker from an image or short video | `/s`, `/stiker` |
| `/toimg` | Turn a sticker into an image | `/toimage`, `/unsticker` |
| `/upscale` | Upscale a photo | - |

### Language (4)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/language` | Select your interface language | - |
| `/languages` | Search all registered language codes; show translation coverage | - |
| `/resetlanguage` | Reset your or group language to English | - |
| `/setlanguage` | Set the group interface language (group admins) | - |

### Permissions (4)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/addsudo` | Grant a mentioned user sudo command access | - |
| `/checksudo` | Check your own permission status | - |
| `/delsudo` | Remove a mentioned sudo user | - |
| `/listsudo` | List limited sudo users privately | - |

### Recover (6)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/antidelete` | Recover deleted messages and statuses (sent to your own chat) | `/antidel` |
| `/deleted` | Show recently deleted items I caught | `/recover` |
| `/getpp` | Get the profile picture of a user | `/pp`, `/dp` |
| `/statusdl` | List and download saved WhatsApp statuses | `/sdl`, `/savestatus` |
| `/vv` | Recover a view-once photo or video | `/viewonce` |
| `/vvn` | Recover a view-once voice note | `/vvvoice` |

### System (1)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/speedtest` | Host HTTPS latency (quick, not bandwidth) | - |

### Utilities (14)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/ascii` | English text to ASCII art | - |
| `/countdown` | Time until a calendar date | - |
| `/date` | Current calendar date | - |
| `/filetype` | Identify a safe file by content | - |
| `/html` | Extract text from a public HTML page | - |
| `/linkpreview` | Get safe public URL metadata | - |
| `/password` | Create a private password without storing it | - |
| `/pdf` | English text to a PDF | - |
| `/remind` | Reviewed owner self-chat reminders | - |
| `/system` | Non-sensitive server statistics | `/stats` |
| `/time` | Current timezone time | - |
| `/timestamp` | Current Unix time in seconds | - |
| `/unzip` | Extract a small safe ZIP | - |
| `/zip` | Compress one safe file | - |

### WhatsApp (3)

| Command | What it does | Aliases |
| --- | --- | --- |
| `/status` | Show bot status: uptime, memory, usage and more | - |
| `/update` | Review and confirm a GitHub update | - |
| `/usage` | Private usage insights | - |

Use `/help <command>` for current arguments and permission checks. Group-admin actions also need the bot to have the required group rights. Recovery and sudo rules are described below.

## Telemetry (anonymous install ping)

Jarvis sends one small ping when it starts and then once a day, so the maintainer can see how many installs exist and which built-in commands are used. It is **on by default** and you can turn it off at any time with `TELEMETRY=off` in your `.env`. A notice is printed at every boot. The code is in `src/telemetry/`.

What is sent (exactly these fields, enforced by a test):
- a random install id (generated on your machine) and the bot version
- uptime in seconds and whether WhatsApp is connected
- a one-way hash of the paired phone number. Phone numbers are guessable, so a hash can be brute-forced by someone who already has a list of numbers; it is not a strong anonymity guarantee. The maintainer's server stores this hash with your install record and can check whether a number the maintainer types in matches a known install (the typed number is hashed on the spot and never stored). It is never used to message you
- how many times each built-in command ran since the last ping (command names only, never arguments)
- the kind of environment the bot runs in, as ONE word from a fixed list (`pterodactyl` for panel hosts such as Katabump, HeavenCloud or Daki, `aws`, `oracle`, `replit`, `docker`, `termux`, `windows`, `macos`, `linux` and a few more). It is guessed from well-known environment markers; no hostname, path, IP address or variable value is ever sent

**`/feedback <message>`** (optional, only when a user runs it) sends that one message to the maintainer's dashboard together with your install's S-ID, through the same channel as the ping. Phone-number-like digit runs and e-mail addresses in the text are removed before sending, the text is capped at 500 characters, and each install is limited to 5 messages a day. Nothing else is attached (no number, name or chat). With `TELEMETRY=off` the command refuses and points to GitHub issues.

What is never sent: messages, chats, contacts, group names or ids, files, your raw phone number, or API keys.

If you pair through the Jarvis pairing portal and put the S-ID it gives you into `settings.js` (`ecosystem.sid`), the ping also carries `ps`: a one-way hash of that portal S-ID, so the maintainer can match your install to your portal account. The S-ID itself and the number in `ecosystem.number` are never sent. Leave `ecosystem.sid` empty and no `ps` is sent.

### Pairing portal (optional, off by default)

If you want the portal to link your own Jarvis: open the pairing page, enter your number, and it shows a short one-time code like `K7QM-4X2P` (valid 15 minutes, works once). **No file editing.**
- Bot already running and linked to WhatsApp: send `/pair K7QM-4X2P` to your own bot (owner only).
- New install: when the bot starts it asks "Portal code from the pairing page (press Enter to skip)", or set the env var `PORTAL_CODE`.

- Maintainer only: `/pair 919876543210` on the maintainer's own bot makes a code for another number (owner only, and only where `PORTAL_URL` and `PORTAL_PROOF_KEY` are set). That person then sends `/pair CODE` to their own Jarvis. Normal installs cannot make codes for anyone else.

**Nothing below runs until you give your bot a code.** The bot trades the code for a ticket (only the code and your number are sent, to the official portal `https://3-110-115-23.sslip.io/portal`, or to `ecosystem.portalUrl` in `settings.js` if you set your own; only `https` or `localhost` is accepted) and stores it in `data/ecosystem-ticket.json`. Pasting `portalUrl`, `ticket` and `number` into `settings.js` still works.

What your bot then does, and exactly what leaves your machine:
- When WhatsApp creates the pairing code, your bot sends the portal your ticket, your number and that one-time code so the pairing page can show it to you. The portal stores only a one-way hash of the number and a sealed copy of the code that is deleted once the link succeeds.
- When WhatsApp connects, your bot asks the portal for a one-time proof and sends it as a WhatsApp message (`JARVIS-PROOF ...`) from your number to the maintainer's number. This is how the portal confirms you really own the number; the maintainer's bot forwards only the proof and your sender number to the portal.
- On the maintainer's own install only (it needs `PORTAL_URL` and `PORTAL_PROOF_KEY` in the environment, which normal installs never have), the bot also tells the portal "online" every 5 minutes while WhatsApp is connected, so the website status badge is real. It sends the bot version only.
- The portal then returns your S-ID. Your bot saves it in `data/ecosystem.json` and sends it to your own "Message yourself" chat. The S-ID is never shown on the web page. `/sid` also shows it.
- The portal records new installs by S-ID only (no number) so the owner dashboard in the app can list them. Your chats and contacts are never sent. The one exception is hosted pairing, described next.

**Hosted pairing (website pairing).** When you pair from the Jarvis website, the portal server starts a short-lived WhatsApp link for your number, shows you the link code, and sends your S-ID to your own "message yourself" chat. While that happens the server briefly holds your WhatsApp login session (the files WhatsApp needs to keep your bot signed in). It is stored sealed, can be collected once, and is deleted when your bot collects it or after 30 minutes, whichever comes first. Your bot collects it at first start using your number and S-ID (5 wrong tries lock it). The server does not read your chats, contacts or files. Prefer to keep the session on your own device only? Set `ecosystem: { autoPair: false }` in `settings.js` and link with the usual QR or pairing code instead. Nothing is collected unless you pair from the website.

**Status beat (after you are paired).** So the Jarvis app can show whether your bot is online, a paired bot sends the portal a small status message every 5 minutes while WhatsApp is connected: your S-ID, an install key the portal gave you at pairing, the bot version, a coarse hosting type (like `aws` or `termux`), uptime, how many commands ran today (a number), and memory use. No chats, contacts, command names, files or phone numbers. It never runs before pairing. Turn it off with `ecosystem: { statusBeat: false }` in `settings.js` or the env var `STATUS_BEAT=off`. The install key is stored in `data/ecosystem.json`.

To stop, delete `data/ecosystem-ticket.json` (and `data/ecosystem.json` to forget the S-ID), and remove `portalUrl` and `ticket` from `settings.js` if you set them. The code is in `src/ecosystem/pairing.js`.

Each install is given a short S-ID (like `S-7K2Q9F`). Run `/sid` to see yours. **The ping response CAN change how your bot behaves, in one narrow way.** The maintainer can send a signed directive to a single S-ID to suspend that install or limit it to N commands per minute per user, for at most 30 days (for example against abuse). To be accepted a directive must: carry a valid Ed25519 signature from the maintainer's key pinned in `src/telemetry/pubkey.js`, name your own S-ID, be unexpired, and be newer than the last one applied. Nothing else can be sent: no code, no commands, no messages, no data requests, no file or setting changes. The maintainer's own install is exempt. `/sid` tells you when a directive is active and when it ends. The maintainer's dashboard also shows simple misuse flags (for example an unusually high command count in one ping, or many new installs from one IP address); flags are visible only to the maintainer. If you do not want any of this, set `TELEMETRY=off`: no ping is sent, so no directive can arrive. The verification key and all of this code are public in this repository, so you can check it yourself; the private signing key stays only on the maintainer's server.

## Install

You need Node.js 20 or newer.

```bash
git clone https://github.com/nicholas-pp8/jarvis-whatsapp-bot.git
cd jarvis-whatsapp-bot
npm install
cp .env.example .env
```

Edit `.env`: optionally set `PAIRING_NUMBER` (digits only, with country code, no plus), or enter it at the console prompt. The linked account becomes owner after authentication.

## Run

```bash
npm start
```

On first start the bot prints an 8 character **pairing code**. On your phone open WhatsApp, go to Linked devices, choose Link with phone number, and type the code. The login is saved in `auth/` so you only do this once.

## Panel setup: Node.js or Python

Both paths run the same Node.js WhatsApp engine. Python is a startup helper, not a separate Python bot. No setup can promise zero errors on every host.

### Node.js panel

Select Node20+ (Node22 recommended). Upload/clone the repository, not another machine's `node_modules`.

```bash
npm ci
cp .env.example .env # only on a new install; never replace an existing .env
npm run check:panel
npm start
```

Panel startup command: `npm start`. Set `PAIRING_NUMBER` in private `.env` (or answer the console prompt). Ownership binds to the authenticated paired account. On a constrained host set `GROUP_STORAGE=json`. Configure the panel to restart the process after an unexpected exit. `npm ci` needs internet on first setup; package install normally supplies ffmpeg, but blocked downloads or an incompatible binary require a host ffmpeg and `FFMPEG_PATH`.

### Python panel

Select Python3.9+ on Linux glibc x64/arm64, upload/clone the repository at the panel project root, and choose `start.py` as its startup file. Do not copy the private live host launcher or Neha files. No pip packages are needed.

```bash
python3 start.py --setup-only
# edit private .env and keep auth/data persistent
python3 start.py
```

The helper uses an existing Node20+ plus npm when available. Otherwise it downloads pinned Node22.23.2 from nodejs.org and verifies a bundled SHA256 before extraction. It installs locked npm dependencies if preflight fails, checks core imports, Sharp and ffmpeg, and only then starts the stable Jarvis runner. `--check` is read-only: no install, downloads, pairing or provider calls. Repeated starts preserve `.env`, auth and data; setup failure stops with an error instead of connecting a half-set-up bot. No unlimited restart loop or source overwrite.

Python-only panels that forbid executable child processes cannot run this Node engine. Automatic runtime installation does not support Alpine/musl, Windows, macOS or other CPUs; use a host-provided Node20+ and npm there. Download/build restrictions, native package compatibility, disk/RAM/CPU quotas and provider failures still matter. First setup may take several minutes and substantially more disk than steady-state use. No root access is needed. Run only one instance against a given auth directory.

Persist `.env`, `auth/`, `data/` and `.runtime/`. Never publish them. Moving panel types does not require pairing again if the same saved auth is kept. Neither entrypoint launches Neha or another bot. If dependencies change, run `npm ci` manually; a successful preflight does not prove every installed version matches the new lockfile.

## Configure

Everything is in `.env`. See `.env.example` for all options.

| Setting | Meaning |
| --- | --- |
| `BOT_NAME`, `PREFIX` | Name and command prefix |
| `OWNER_NUMBER` | Number with owner rights |
| `ALLOW_GROUPS`, `OWNER_ONLY` | Where and for whom the bot answers |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` | Free AI keys for `/ask`. Any one is enough |
| `BOT_TZ` | Timezone for `/schedule` |
| `MAX_FILE_SIZE_MB`, `MAX_VIDEO_HEIGHT`, `COMMAND_COOLDOWN` | Download and rate limits |

Keys are free: [Google AI Studio](https://aistudio.google.com/apikey), [Groq](https://console.groq.com/keys), [OpenRouter](https://openrouter.ai/keys).

## Group setup

1. Add the bot number to your group and make it an admin.
2. Type `/groupconfig` to see the settings.
3. Turn on only what you want: `/welcome on`, `/antilink on`, `/antispam on`, `/antiflood on`, `/blockword add <word>`.
4. Set `/setrules <text>` and a daily message with `/schedule 09:00 Good morning`.

Settings are stored per group in `data/groups.sqlite` when SQLite works on your host, or `data/groups.json` otherwise. Warnings keep their history.

## Ban-risk notes

* All automatic moderation is **off by default**. Turn on one feature at a time.
* `/tagall` mentions everyone in one message and has a 10 minute cooldown for admins.
* All bot messages and admin actions go through one queue: about one message per 1.2 seconds, and one add/remove/promote per 2.5 seconds.
* Do not add many people quickly with `/add`. Share the invite link instead.
* Do not run the bot in many large groups from a brand new number.
* Never share your `auth/` folder or `.env`. Anyone with `auth/` controls the WhatsApp account.

## Project layout

```text
src/
  commands/     one file per command (auto loaded)
  groups/       group module: storage, permissions, moderation, scheduler, commands
  recover/      deleted message, status and view-once cache
  tts/          speech providers, voices and limits
  downloaders/  YouTube, Pinterest and public social videos
  services/     bounded image-enhancement adapters
  ai/           AI providers
  connection/   Baileys connection and pairing
  handlers/     message and command handling
  utils/        image tools, queue, logging, helpers
test/           node --test suites
```

Add a command: create `src/commands/hello.js` that exports `{ name, category, description, usage, run(ctx) }`.

## Tests

```bash
npm test
```

## License

MIT

## Health, usage, QR and updates (v1.3.0)

- `/qr <text or URL>` creates a 1024px PNG QR. Accepts up to 2,000 UTF-8 bytes, including vCard and Wi-Fi text. It uses memory, leaving no QR temp files.
- `/usage` is owner-only in private chats. Only command names, counts, error counts and hour totals are stored, not arguments, message text, phone numbers or chat IDs. Retention is 35 days. Owner favorites appear in private owner menus. Alias hints are suggestions, never automatic command changes.
- Self-chat reports default to 10 AM Asia/Kolkata, with weekly usage on Sundays. `OPS_REPORT_HOUR` changes the hour (0-23). If offline, reports wait for reconnect; WhatsApp cannot deliver an offline alert while disconnected.
- Health checks run once a minute. Sustained disconnects, five errors in five minutes, and repeated 90% RAM pressure produce conservative alerts with one-hour cooldowns. RAM readings describe the shared container, not only Jarvis. Disk alerts require explicit `HOST_DISK_LIMIT_MB`; they measure Jarvis's own files, not the provider's complete shared quota. No arbitrary source edits or process kills are attempted.
- Every ten minutes, expired recover cache entries and abandoned temp jobs are pruned. Existing recover limits remain 80 MiB total, 20 MiB/file, 48-hour message/view-once and 25-hour status expiry. Active jobs and auth/config/settings are preserved. Cleanup reduces waste but cannot guarantee unlimited free space.
- Start via `npm start` (`scripts/runner.js`). A process supervisor must restart Jarvis after exits; this does not restart other bots. Fatal exceptions exit for supervisor recovery. Existing WhatsApp reconnect logic stays in place.
- `/update` runs only from the linked owner's self-chat. It checks `nicholas-pp8/jarvis-whatsapp-bot` main, shows a higher semantic version and changelog, then requires `/update confirm <full commit SHA>` within ten minutes. Periodic reminders check hourly. Same-version commits do not trigger an update.
- Updates pin the displayed commit, check file hashes, reject symlink paths, syntax-check changed JS and stage source before replacing it. Dependencies/runtime changes require a manual tested deployment. `.env`, auth, data, downloads, binaries, dependency lockfile and stable runner are never overwritten. A failed boot or health timeout restores previous changed files once on restart. The supervisor must launch the stable runner, and any embedding host launcher must preserve subsequently installed source rather than replay older code.

## Utilities (v1.4.0)

- `/filetype` identifies uploaded/replied files from content, not filename. Media downloads and image inputs are checked before processing. Executables, unknown binary types, script-like text and nested ZIPs are rejected. Utility files are limited to 10 MiB. ZIP output/extraction stays in memory, leaving no temporary copies.
- `/zip` compresses one replied safe file. `/unzip` accepts at most 20 entries and 20 MiB expanded content; rejects unsafe paths, symlinks, excessive expansion and unsupported contents. Archives are validated before any files are sent.
- `/password [8-64] [all|alnum|letters|digits]` is owner self-chat only. Uses cryptographic random generation. Generated values are sent to WhatsApp but not written to bot logs, usage counts or caches. WhatsApp/chat history still retains the message.
- `/remind add YYYY-MM-DDTHH:mm Asia/Kolkata <text>` shows the exact self-chat message and time for review. Confirm with the displayed code within ten minutes. `/remind list` and `/remind cancel <id>` manage persistent reminders. One-shot reminders only, max 20 jobs, max 90 days ahead, max 1,000 characters. Sends on the next minute tick when online. Offline jobs wait. A transport error or interrupted send is marked uncertain, not retried automatically, to prevent duplicates. Check list and cancel/recreate if needed. Only the linked owner's actual self-chat can create reminders.
- `/system` (`/stats`) is private owner-only, with CPU, RAM, filesystem usage, OS/Node and uptime. No hostnames, network addresses, serials, user names or paths. Filesystem usage is not provider quota usage.
- `/linkpreview <URL>` shows title, description, site and image URL. `/html <URL>` extracts page text/metadata without running scripts. Only public HTTP/HTTPS on standard ports, DNS-pinned addresses, validated redirects, 10-second socket timeout and 1 MiB HTML cap. No cookies, credentials or browser login sent.
- `/ascii <text>` supports up to 60 English ASCII characters with capped output. Only the Small font is needed on lightweight hosts. `/pdf <text>` makes a basic PDF from up to 10,000 bytes of English text. Unicode fonts are not included.
- `/time [IANA timezone]`, `/date [IANA timezone]`, `/timestamp`, `/countdown YYYY-MM-DDTHH:mm [IANA timezone]`. Default Asia/Kolkata. Invalid dates/zones and past countdown targets are rejected.
- All utilities have a three-second per-user cooldown, including owner requests. File/text/response limits apply.
- Set `GROUP_STORAGE=json` on small hosts with broken optional SQLite binaries. This skips native probes and prevents their crash dumps; existing JSON group settings stay intact.

## v1.5 games, sudo and latency

- `/ttt` plays tic-tac-toe against an unbeatable bot. Use `/ttt 1` through `9`, or cancel.
- `/jumble`, `/wordgame` and `/quiz math|words` have isolated per-user/chat sessions. Word-making uses a small curated English dictionary. `/quiz leaderboard` uses pseudonymous player labels.
- `/8ball`, `/coinflip`, `/dice`, `/joke`, `/quote`, `/fact`, `/choose a | b` are offline fun commands. `/poll question | a | b` creates a single-choice group poll and requires group admin or primary owner.
- `/speedtest quick` measures host HTTPS latency to Cloudflare with a HEAD-only request and a 5-second timeout. It includes DNS/TLS time, is not phone speed, and does not measure Mbps. Full bandwidth tests are not installed.
- Primary owner uses `/addsudo @user`, `/delsudo @user`, `/listsudo`. `/checksudo` reports the caller's status. International number (with or without +) or one actual @mention per change. Owner self-chat: `/addsudo +16508702892`, `/delsudo +16508702892`. Duplicate users are rejected. Membership persists in `data/db.json`; the last 100 add/remove audit records retain hashed identities and timestamps.
- This owner's chosen policy grants sudo access to otherwise owner-only commands, except add/remove/list sudo management. A sudo cannot grant another sudo. Group commands retain group-admin and bot-admin checks. Removing sudo affects the next command; already-running actions cannot be recalled.
- Sudo password/update commands require the caller's own private DM. Reminders require review and confirmation, deliver to the caller's private chat, and keep each user's list/cancel scope separate. Legacy reminders remain owner-only. No automatic retry after an ambiguous reminder send.

Permission modules may specify `requiredLevel: user|admin|sudo|owner`. The current owner policy permits full sudo access for `owner` commands except the three membership-management commands. `admin` means actual WhatsApp group admin or primary owner, not sudo alone. A global owner-only gate permits configured sudo users too.

Every startup imports and validates all command definitions, permissions, arguments and alias formats, and runs pure game sanity checks. Log reports passed/failed counts and names failed commands; an invalid registry fails startup rather than going online half-loaded. This is offline validation, not a claim that every command works against WhatsApp/media providers. No group actions, messages, downloads, updates or bandwidth tests run during boot.

Image host repair installs only the two locked Linux-x64 Sharp/libvips prebuilt packages and runs a PNG-to-WebP runtime check, without SQLite or build scripts. Document/audio quote cache stores metadata for up to 150 recent media messages, not original file bytes. Utility quote fallback checks the same chat.

## Virtual economy, recovery and language interface (deployed in v1.6.x)

Virtual coins have no monetary value, gambling or cash-out. `/balance`, `/daily`, `/earn`, `/profile`, `/leaderboard`, `/achievements`, `/economy` read or earn coins. Defaults: 100 daily per rolling 24 hours; 10 per minute; maximum balance 1,000,000. `/pay +international_number amount` prepares a review. Only the same user in the same chat can `/pay confirm code` within two minutes; amounts are whole coins 1-10000. Confirmation is consumed once, and persisted message IDs prevent repeated mutation after restart. Transfers have a persisted two-second cooldown and a maximum of 100 per UTC day. Reward and transfer commands refuse stale deliveries older than five minutes. Recipient numbers are explicit; quoted users or unrelated mentions never replace them. Phone-number identities only; unverified LIDs are refused rather than treated as phone numbers. Leaderboards use hashed pseudonyms, not phone numbers.

Atomic JSON transactions replace unreliable native SQLite on this host. Economy schema/rules/balances are validated; corrupt stores fail closed without resetting wealth. `/economyrules` requires owner/sudo permission and changes `daily`, `earn`, `earnCooldown` (milliseconds) or `maxBalance` within validated bounds. Data lives in private `data/economy.json`; back it up along with `data/db.json` and `data/groups.json`. Group storage no longer launches SQLite probes. The optional SQLite dependency is not required and is omitted on this host.

Central command failures get sanitized classes and reference IDs. `/errors` is owner/sudo-only, private-chat-only, and reports recent IDs plus per-plugin recurrence. Private diagnostics keep command name, time, safe error code and class, never message arguments, URLs, stack traces, phone numbers or keys. Safe retry is explicitly limited to pre-send idempotent HTTP reads, at most two attempts in the downloader and safe public HTML GET. Whole commands, sends, uncertain transfers, writes and group changes are never retried automatically. Some legacy plugins have their own error handlers; full migration remains open.

Language registry and honest key-level coverage: [src/i18n/README.md](src/i18n/README.md). Every registered code is selectable; missing translations use English. Key-complete major-language locales and partial locale files are counted separately in coverage.json. The core schema has 164 keys across 77 complete locale files; the separate runtime schema has 228 keys across 70 complete locale files (English plus 69 non-English). Neither count proves native fluency or full translation of every plugin. The 100+ translated-schema target is still open. Language selections require a successful settings write; unreadable settings files are preserved, not silently reset.

## Downloads and image enhancement (v1.6.3)

- `/ig <public link>`, `/fb <public link>` and `/x <public link>` alias `/instagram`, `/facebook`, `/twitter`. No login/private-content or live-stream route. Limits include 30 minutes, 480px video height, bounded size/time, structural checks and temp cleanup. Public IG/FB/X sample downloads passed real network/file probes during development. Actual user-facing WhatsApp file delivery for those social samples has not yet been verified. Site access and individual posts can still fail.
- `/apk <name or package ID>` sends the recommended F-Droid APK for a unique exact match. Ambiguous names show numbered choices; reply with a number within two minutes in the same chat as the same sender. `/apksearch` searches, `/apkinfo` reads metadata, `/apkdownload` accepts a package ID or validated official F-Droid APK URL. No proprietary-app delivery, split APKs, installation, malware scan or signing-certificate verification. APK structure/package identity and computed SHA256 are checked. Local F-Droid download passed; owner search worked, but WhatsApp APK file delivery is not yet verified.
- `/remini` (alias `/enhance`) and `/upscale` default to local Sharp resizing. `/sharpen` and `/denoise` are local. This is not AI face restoration. `/restore` requires a configured restoration provider.
- Explicit external syntax: `/remini clipdrop 2 yes` on a static photo. External trials are owner-permission only and require per-photo disclosure confirmation. No silent provider fallback, credit topup or POST retry. Clipdrop upscales, not face-restores. Input: JPEG/PNG/WebP,10MiB,16MP; output:20MiB,4096px per side.
- The code is live, but host Clipdrop execution is enabled with an owner-approved cap of99 attempted calls. Local Sharp remains the default; choose Clipdrop explicitly and confirm disclosure per photo. One separate bounded synthetic Clipdrop test succeeded (HTTP200,512x384JPEG,14572bytes); the response reported99credits left. That is a historical API report, not a live balance guarantee or proof of personal-photo quality. No personal photo was used.
- Store the Clipdrop key privately in `.env`, never in source. `REMINI_CLIPDROP_ENABLED` and `REMINI_CLIPDROP_BUDGET` require explicit owner approval. `data/image-credit-budget.json` records attempted calls atomically before POST; failures/timeouts may consume credits. Preserve this file across restarts. The budget is local accounting, not the provider's live wallet.
- PixelBin remains disabled pending retention/disclosure and credit approval; provider-hosted output can remain about30days. Replicate remains disabled pending separate paid approval. Clipdrop retention is unverified. Default `.env.example` disables all external adapters.

See [download notes](docs/downloads-build-notes.md) and [image notes](docs/image-enhancement-notes.md) for checks and sources.

## Explicit image providers and phone info

`/remini codeformer 2 yes` and `/remini snapedit 2 yes` send only the chosen photo to that provider. Both default disabled and require configured free allowance. CodeFormer may consume daily ZeroGPU quota; small-image internal enlargement is normalized to the requested dimensions. SnapEdit uses4credits at2x,7at4x. No automatic image retry/fallback or paid upgrade. Existing Clipdrop remains separate.

`/truecaller +919876543210 yes` sends one number to enabled Veriphone/IPQS/DataCrawler sources, keeps differing claims separate, and excludes exact addresses/emails/age/images. DataCrawler currently supports India only. Free caps are conservative lifetime reservations, no automatic renewal. Provider fees/availability can change; configure before use.

### Combined games (JSON profiles)

The games extension uses one session manager for17new brain commands and10multiplayer game types. Existing `/quiz`, `/jumble` (scramble), `/wordgame` (anagram) and solo `/ttt` remain; no duplicate game commands. `/ttt @player` adds multiplayer and `/leaderboard games` shows new-game XP without replacing the existing economy leaderboard.

- `/games`, `/gamehelp`, `/gameprofile`, `/gamestats`, `/achievements`, `/streak`, `/dailychallenge`.
- Solo: `/mathquiz medium`, then `/mathquiz answer 42`. `/wordle` and `/dailychallenge` share one daily claim per UTC day.
- Challenge: `/connect4 @player`, `/accept SESSION`, `/move SESSION 4`, `/leavegame SESSION`. Group members are checked through live group metadata. Rock-paper-scissors choices are locked and submitted privately, not revealed before both are ready.
- `/teamquiz` requires4/6/8players, alternate player order forms teams. `/reaction @player` waits for a random GO signal. Results use receipt order, not a measurement of human reaction time independent of network latency.
- JSON `data/game-profiles.json`: atomic rename/fsync, hashed player IDs, scores/XP/stats/streaks/achievements, no money or credits. Corrupt storage blocks score writes and preserves the original file. One process only, not shared across servers. Hourly XP cap200/player, short cooldowns, repeat-answer protection.
- Sessions are in memory and canceled by restart, with no automatic resume or XP. Profiles persist. Inactivity expires within a5second cleanup interval; invitations default60s, turns45s, solo questions60s. Memory recalls after5s, but the first message stays in WhatsApp history; this is a casual memory exercise, not cheat-proof competition.
- New banks/prompts and help currently use English. Existing language menus fall back to command descriptions. Offline question banks are small reviewed sets, not live trivia feeds.
- The owner selected JSON after an isolated better-sqlite3@13.0.3 host Node22.11.0 probe crashed with SIGSEGV11. No other SQLite driver installed. Existing optional dependency and old game-score file left alone.

Downloaded videos are normalized centrally before WhatsApp delivery: H.264 baseline/yuv420p video, AAC stereo audio when present, MP4 faststart, dimensions bounded by configured height. Compatible H264/yuv420p videos are fully remuxed; incompatible audio alone is transcoded when possible, otherwise ultrafast video conversion is used. Conversion and full output decode are time-limited (1hour each), one encoding thread, actual output size checked. Download commands send progress once per minute while preparing video. Bad/truncated output is rejected rather than sent. YouTube, Pinterest and public social downloads share this sender. This is not confirmation that every recipient handset plays the result; a live phone retest follows deployment.

## Resource modes

Owner-only `/power`, `/balanced`, `/save` persist in `data/performance-mode.json`; `/power status` (or either other command with `status`) reads the current mode. Balanced is the default on a new install. `/status` shows it.

- Balanced: one queued media job, one FFmpeg/Sharp worker, no added delay. Sharp cache50MiB, capped16MiB on small hosts.
- Power: configurable requested1-20media jobs (`/power 20`, default2), clamped by estimated host memory and CPU, and up to two FFmpeg/Sharp workers, Sharp cache64MiB. Budget reserves256MiB base plus256MiB per job, at most one media job per CPU core quota and20overall. Small hosts remain one worker/job and16MiB cache. This is an estimate, not a guarantee against OOM; complex jobs can need more RAM.
- Save: one media job/worker,3second delay before each queued heavy job, Sharp cache disabled. It can reduce media working-set pressure, not guarantee a RAM limit.

Modes affect queued downloads/image enhancement, central video preparation and global Sharp processing. They do not change provider quotas, image resolution, file limits, codec checks, full-file delivery, WhatsApp reconnect, games or group timers. Running work is not canceled when the mode changes. Changing mode does not allocate host RAM/CPU, increase Node heap or guarantee speed. Many commands remain light and unaffected. All video modes keep fast selective conversion and1hour conversion/decode caps so saver does not bring back the short full-song timeout. Performance is best-effort under host/provider limits. No paid provider retry or fallback.

Power job counts are total queued-media concurrency across users, not a per-user grant. Existing per-user2job and waiting-queue10job limits still apply. Reducing the cap does not cancel running work; new starts wait until capacity is available. Power20 requires at least20CPU cores quota and roughly5.25GiB host memory under this estimate, and still needs real workload tuning.

1080p requires MAX_VIDEO_HEIGHT=1080 in private host .env and restart. Transcoded1080p30 uses H264 level4.0; lower sources are not upscaled. Video progress displays actual FFmpeg stage percentage and remaining time from processed time/speed after it becomes available. Initial estimate and upload/network duration are unknown rather than guessed. Stage estimates exclude subsequent validation/upload and can change; no full-send delivery deadline is promised. One-hour caps apply separately to conversion and full decode; downloads keep their own existing limit.

## Automatic paired owner

After authenticated WhatsApp connection opens, the linked account phone ID and typed LID (when supplied by that same account credentials) are saved privately in auth/paired-owner.json with0600permissions. The current linked account becomes owner; manual OWNER_NUMBER is no longer needed for ownership after connection. PAIRING_NUMBER still selects which number to pair. The saved file is for persistence/inspection, never used by itself to grant authority: every connection rebinds from authenticated socket/credential identity. Owner binding/save failure stops startup rather than trusting old config. Re-pairing another account replaces the owner record from the new authenticated account. Owner /update remains self-chat-only; outgoing owner commands sent to other people do not become private operator actions. Inbound sudo DM rules stay unchanged. A forwarded ID, message text or unverified LID cannot assign ownership.

## GitHub commit updates

Jarvis links to nicholas-pp8/jarvis-whatsapp-bot main, checks hourly while online, and notifies the paired owner once per new source commit. Detection compares Git blob hashes against allowed local source, so a same-package-version commit is no longer ignored. No auto-install occurs on the timer. `/update check` previews; bare `/update` in an allowed private operator chat checks the current commit, verifies/stages source, applies it, then exits for panel/supervisor restart. Legacy `/update confirm <commit>` refuses if latest changed. Dependencies/optional dependencies/Node engine changes are announced but require manual tested deployment. Secrets/auth/data/binaries/lockfile/stable runner are never overwritten; unchanged/deleted source paths outside the safe updater scope are not removed. Public repo changes from whoever has repo write access are trusted release code; protect that account. GitHub outages/rate limits can delay alerts. Existing health rollback still restores failed source updates. Host must restart on clean exits; an embedding launcher must not reapply old source.

Owner commands can originate in contacts or groups. Owner-only command output and internal `/status` reports are delivered only to the authenticated paired account self-chat, without quoting the public-origin message. Internal commands (including update, statistics, diagnostics and usage) get a private execution context; group-operation targets remain their original group. Normal media and group game replies retain their intended destination. Authorization remains unchanged: public commands do not become owner commands; `/update` additionally requires paired-owner authority. Sudo command output also goes to owner self-chat, not the requester.

## Detailed weather (personal/non-commercial)

`/weather city` or `/weather city, country` uses keyless Open-Meteo for personal/non-commercial use only, with CC BY4.0 attribution. No city means a prompt, not a guessed location. Duplicate city names require a numbered choice (`/weather pick 1`) in the same chat from the same sender, expiring after five minutes. Data is model weather, not a station observation. Reports include weather, precipitation probability/amount, clouds, temperature, humidity, wind/gusts, pressure, visibility, UV, sun times, short hourly/day outlook and calculated moon events/illumination. All event times use the selected location's timezone; missing moonrise/moonset on a local day is normal, not an error. Calculations do not account for local hills/buildings and cannot promise observed astronomical sightings. SunCalc2.0.1 BSD license is retained in its vendored source; verified npm archive SHA512 is recorded there. Geo cache24hours/weather10minutes; bounded900providerrequests/day per process, no automatic retry or paid fallback. Commercial deployments must use a separately authorized source/service plan; free API terms do not cover them.

## Complete scripture editions

`/quran`, `/gita`, `/bible` offer contents, explicit chapter/verse/range reading, `next`/`prev` pages and `full` documents. Reading state is scoped to sender+chat for30minutes; no AI paraphrase or generated missing verses. Example `/gita 2 47`, `/quran 1 1`, `/bible 43 3 16` (book43=John). Every result labels the language, edition and source. Quran: Arabic Tanzil Uthmani v1.1,114surahs/6236verses, exact full download including copyright, CC BY3.0 verbatim permission, https://tanzil.net/download/ and https://tanzil.net/docs/text_license . Gita: Sanskrit Devanagari Wikisource base text,18chapters/700verses, commentary excluded, CC BY-SA transcription attribution; chapter13uses34verse numbering of this source, not every edition's numbering. Bible: English WEB Protestant updated LORD edition,66books/1189chapters, public domain publisher https://ebible.org/engwebp/ . This is an English translation, not original Hebrew/Greek, and not a Catholic/Orthodox canon. Numbered textual-note-only positions are retained as source notes, not invented main verses. `/bible full` delivers the exact publisher HTML ZIP with headings/notes, extract and open index.htm; chat reading uses verse text and publisher notes. Quran/Gita full delivery is UTF8text with source labels/rights. Complete assets are SHA256pinned in a manifest and loaded on demand; corruption fails closed. These large book assets are deliberately outside source-only automatic updater and need manual verified deployment. No provider call occurs while reading installed books.
