// Languages and voices. Add a language here and it works for every provider that supports it.
// female / male are Microsoft Edge neural voice names (the main free provider).
export const LANGS = {
  en: { name: 'English', female: 'en-US-AriaNeural', male: 'en-US-GuyNeural', google: 'en' },
  hi: { name: 'Hindi', female: 'hi-IN-SwaraNeural', male: 'hi-IN-MadhurNeural', google: 'hi' },
  bn: { name: 'Bengali', female: 'bn-IN-TanishaaNeural', male: 'bn-IN-BashkarNeural', google: 'bn' },
  ta: { name: 'Tamil', female: 'ta-IN-PallaviNeural', male: 'ta-IN-ValluvarNeural', google: 'ta' },
  te: { name: 'Telugu', female: 'te-IN-ShrutiNeural', male: 'te-IN-MohanNeural', google: 'te' },
  mr: { name: 'Marathi', female: 'mr-IN-AarohiNeural', male: 'mr-IN-ManoharNeural', google: 'mr' },
  gu: { name: 'Gujarati', female: 'gu-IN-DhwaniNeural', male: 'gu-IN-NiranjanNeural', google: 'gu' },
  kn: { name: 'Kannada', female: 'kn-IN-SapnaNeural', male: 'kn-IN-GaganNeural', google: 'kn' },
  ml: { name: 'Malayalam', female: 'ml-IN-SobhanaNeural', male: 'ml-IN-MidhunNeural', google: 'ml' },
  pa: { name: 'Punjabi', google: 'pa' },
  ur: { name: 'Urdu', female: 'ur-PK-UzmaNeural', male: 'ur-PK-AsadNeural', google: 'ur' },
  ar: { name: 'Arabic', female: 'ar-SA-ZariyahNeural', male: 'ar-SA-HamedNeural', google: 'ar' },
  es: { name: 'Spanish', female: 'es-ES-ElviraNeural', male: 'es-ES-AlvaroNeural', google: 'es' },
  fr: { name: 'French', female: 'fr-FR-DeniseNeural', male: 'fr-FR-HenriNeural', google: 'fr' },
  de: { name: 'German', female: 'de-DE-KatjaNeural', male: 'de-DE-ConradNeural', google: 'de' },
  it: { name: 'Italian', female: 'it-IT-ElsaNeural', male: 'it-IT-DiegoNeural', google: 'it' },
  pt: { name: 'Portuguese', female: 'pt-BR-FranciscaNeural', male: 'pt-BR-AntonioNeural', google: 'pt' },
  ru: { name: 'Russian', female: 'ru-RU-SvetlanaNeural', male: 'ru-RU-DmitryNeural', google: 'ru' },
  ja: { name: 'Japanese', female: 'ja-JP-NanamiNeural', male: 'ja-JP-KeitaNeural', google: 'ja' },
  ko: { name: 'Korean', female: 'ko-KR-SunHiNeural', male: 'ko-KR-InJoonNeural', google: 'ko' },
  zh: { name: 'Chinese', female: 'zh-CN-XiaoxiaoNeural', male: 'zh-CN-YunxiNeural', google: 'zh-CN' },
  id: { name: 'Indonesian', female: 'id-ID-GadisNeural', male: 'id-ID-ArdiNeural', google: 'id' },
  tr: { name: 'Turkish', female: 'tr-TR-EmelNeural', male: 'tr-TR-AhmetNeural', google: 'tr' },
};

// Extra named voices, picked with e.g. /tts en neerja Hello
export const NAMED = {
  neerja: 'en-IN-NeerjaNeural', prabhat: 'en-IN-PrabhatNeural', sonia: 'en-GB-SoniaNeural', ryan: 'en-GB-RyanNeural',
  aria: 'en-US-AriaNeural', jenny: 'en-US-JennyNeural', guy: 'en-US-GuyNeural', davis: 'en-US-DavisNeural',
  swara: 'hi-IN-SwaraNeural', madhur: 'hi-IN-MadhurNeural',
};

const SCRIPTS = [
  [/[\u0900-\u097F]/, 'hi'], [/[\u0980-\u09FF]/, 'bn'], [/[\u0B80-\u0BFF]/, 'ta'], [/[\u0C00-\u0C7F]/, 'te'],
  [/[\u0A80-\u0AFF]/, 'gu'], [/[\u0C80-\u0CFF]/, 'kn'], [/[\u0D00-\u0D7F]/, 'ml'], [/[\u0A00-\u0A7F]/, 'pa'],
  [/[\u0600-\u06FF]/, 'ar'], [/[\u0400-\u04FF]/, 'ru'], [/[\u3040-\u30FF]/, 'ja'], [/[\uAC00-\uD7AF]/, 'ko'], [/[\u4E00-\u9FFF]/, 'zh'],
];
/** Guesses the language from the writing system. Latin text is treated as English. */
export function detectLang(text) {
  for (const [re, code] of SCRIPTS) if (re.test(text)) return code;
  return 'en';
}
export const langList = () => Object.entries(LANGS).map(([c, l]) => `${c} ${l.name}`);
