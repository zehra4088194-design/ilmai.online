/**
 * Text-to-speech helpers for the voice call (browser speechSynthesis).
 * Voices are listed per device, so the choice is stored on this device (localStorage, not security-relevant).
 * Best quality: Microsoft Edge ("... Online (Natural)" voices) and Chrome/Android ("Google ..." voices).
 */
export type VoiceGender = 'any' | 'female' | 'male';
export type VoicePrefs = { voiceURI: string; gender: VoiceGender; rate: number; pitch: number };
export const DEFAULT_VOICE_PREFS: VoicePrefs = { voiceURI: '', gender: 'female', rate: 1, pitch: 1 };
const KEY = 'ilm-voice';

export function loadVoicePrefs(): VoicePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<VoicePrefs> | null;
    if (!raw || typeof raw !== 'object') return DEFAULT_VOICE_PREFS;
    return {
      voiceURI: typeof raw.voiceURI === 'string' ? raw.voiceURI : '',
      gender: raw.gender === 'male' || raw.gender === 'any' ? raw.gender : 'female',
      rate: Math.min(1.4, Math.max(0.6, Number(raw.rate) || 1)),
      pitch: Math.min(1.3, Math.max(0.7, Number(raw.pitch) || 1)),
    };
  } catch { return DEFAULT_VOICE_PREFS; }
}
export function saveVoicePrefs(prefs: VoicePrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage optional */ }
}

const FEMALE = /female|woman|zira|aria|jenny|samantha|victoria|karen|moira|tessa|fiona|susan|hazel|heera|sonia|libby|ava\b|emma|michelle|natasha|joanna|salli|kendra|kimberly|ivy|uzma|catherine|allison|nicole|amy|sara|lekha|veena|raveena|kalpana|swara|neerja|clara|zoe|serena|siri|google uk english female/i;
const MALE = /\bmale\b|david|\bmark\b|guy|davis|james|george|richard|ryan|christopher|eric|roger|steffan|asad|prabhat|madhur|hemant|rishi|daniel|alex|fred|\btom\b|aaron|arthur|brian|matthew|joey|justin|kevin|liam|thomas|oliver|andrew|stefan|google uk english male/i;

export type VoiceOption = { voice: SpeechSynthesisVoice; gender: 'female' | 'male' | 'unknown'; quality: number; label: string };

export function describeVoice(voice: SpeechSynthesisVoice): VoiceOption {
  const name = voice.name;
  const gender = FEMALE.test(name) ? 'female' : MALE.test(name) ? 'male' : 'unknown';
  const quality = /natural|neural|online/i.test(name) ? 3 : /google|premium|enhanced/i.test(name) ? 2 : 1;
  const clean = name.replace(/^Microsoft\s+/i, '').replace(/\s*-\s*.+$/, '').replace(/\s*\(Natural\)/i, '').trim();
  return { voice, gender, quality, label: `${clean} · ${voice.lang}${quality === 3 ? ' · Natural' : quality === 2 ? ' · HD' : ''}` };
}

/** Voices for the languages this app speaks (English + Urdu/Hindi). */
export function listVoiceOptions(voices: SpeechSynthesisVoice[]): VoiceOption[] {
  return voices
    .filter((v) => /^(en|ur|hi)/i.test(v.lang))
    .map(describeVoice)
    .sort((a, b) => b.quality - a.quality || a.label.localeCompare(b.label));
}

export const isUrduScript = (text: string) => /[\u0600-\u06FF]/.test(text);

export function pickVoice(voices: SpeechSynthesisVoice[], prefs: VoicePrefs, text: string): SpeechSynthesisVoice | null {
  const lang = isUrduScript(text) ? ['ur', 'hi'] : ['en'];
  const inLang = voices.filter((v) => lang.some((l) => v.lang.toLowerCase().startsWith(l)));
  const pool = inLang.length ? inLang : voices;
  const chosen = pool.find((v) => v.voiceURI === prefs.voiceURI);
  if (chosen) return chosen;
  const options = pool.map(describeVoice);
  const byGender = prefs.gender === 'any' ? options : options.filter((o) => o.gender === prefs.gender);
  const ranked = (byGender.length ? byGender : options).sort((a, b) => b.quality - a.quality);
  return ranked[0]?.voice ?? null;
}

/** Removes markdown, code, formulas, links and emoji so the voice reads naturally. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' code block. ')
    .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$/g, ' formula. ')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/[`*_#>|~]/g, ' ')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
}

/** Chrome stops long utterances after ~15 s, so speak sentence-sized chunks. */
export function splitSpeech(text: string, max = 220): string[] {
  const sentences = text.match(/[^.!?۔؟\n]+[.!?۔؟]*/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if ((current + ' ' + sentence).trim().length > max && current) { chunks.push(current); current = sentence; }
    else current = (current + ' ' + sentence).trim();
  }
  if (current) chunks.push(current);
  return chunks.flatMap((c) => (c.length > max * 1.6 ? c.match(new RegExp(`.{1,${max}}(\\s|$)`, 'g')) ?? [c] : [c]));
}

export function stopSpeaking() {
  if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
}

export function speak(text: string, prefs: VoicePrefs, handlers: { onStart?: () => void; onEnd?: () => void; onError?: () => void } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) { handlers.onError?.(); return; }
  const synth = window.speechSynthesis;
  const chunks = splitSpeech(text);
  if (!chunks.length) { handlers.onEnd?.(); return; }
  const voice = pickVoice(synth.getVoices(), prefs, text);
  let finished = false;
  const finish = (cb?: () => void) => { if (finished) return; finished = true; cb?.(); };
  synth.cancel();
  chunks.forEach((chunk, index) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? (isUrduScript(text) ? 'ur-PK' : 'en-US');
    utterance.rate = prefs.rate;
    utterance.pitch = prefs.pitch;
    if (index === 0) utterance.onstart = () => handlers.onStart?.();
    if (index === chunks.length - 1) utterance.onend = () => finish(handlers.onEnd);
    utterance.onerror = (event) => {
      if (event.error === 'interrupted' || event.error === 'canceled') return;
      finish(handlers.onError);
    };
    synth.speak(utterance);
  });
}
