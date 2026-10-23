// Microsoft Edge read-aloud voices through the msedge-tts package. Free, no API key.
export default {
  name: 'edge',
  async available() {
    try { await import('msedge-tts'); return true; } catch { return false; }
  },
  supports: (lang, voice) => !!voice,
  async synth({ text, voice, timeoutMs }) {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = await tts.toStream(text);
    const chunks = [];
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => { try { audioStream.destroy(); } catch { /* ignore */ } reject(new Error('timeout')); }, timeoutMs);
      audioStream.on('data', (d) => chunks.push(d));
      audioStream.on('end', () => { clearTimeout(t); resolve(); });
      audioStream.on('error', (e) => { clearTimeout(t); reject(e); });
    });
    try { tts.close?.(); } catch { /* ignore */ }
    const buf = Buffer.concat(chunks);
    if (buf.length < 500) throw new Error('empty audio');
    return { buf, ext: 'mp3' };
  },
};
