# zenbot-nsfw (vendored)

Search and link-extraction helpers for XVideos, XNXX, Pornhub and xHamster, copied from
[@soyaxell09/zenbot-scraper](https://www.npmjs.com/package/@soyaxell09/zenbot-scraper) v1.1.9
by AxelDev09 (https://github.com/AxelDev09), MIT licence (see LICENSE). Used only by the
`.xvideos` command (src/commands/xvideos.js).

Changes from the original are marked "TAB BOT change" in each file header:
- phdl.js: `phDownloadBuffer` removed (shell exec, whole video in RAM).
- xhammerdl.js: `xhamsterDownloadBuffer` removed; prefers h264 over AV1; returns direct h264 mp4 links.
- rule34.js was not vendored.
