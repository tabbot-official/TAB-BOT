#!/usr/bin/env python3
"""Identify a song from a short audio clip with the free Shazam service. Prints one JSON line."""
import asyncio, json, os, sys
libs = os.environ.get("JARVIS_PYLIBS")
if libs and os.path.isdir(libs):
    sys.path.insert(0, libs)
try:
    from shazamio import Shazam
except Exception:
    print(json.dumps({"error": "NO_LIB"})); sys.exit(0)

async def main():
    r = await Shazam().recognize(sys.argv[1])
    t = r.get("track")
    if not t:
        print(json.dumps({"match": False})); return
    print(json.dumps({"match": True, "title": t.get("title"), "artist": t.get("subtitle"), "url": t.get("url"),
                      "genre": (t.get("genres") or {}).get("primary")}))

try:
    asyncio.run(asyncio.wait_for(main(), 40))
except Exception as e:
    print(json.dumps({"error": "FAIL", "detail": str(e)[:80]}))
