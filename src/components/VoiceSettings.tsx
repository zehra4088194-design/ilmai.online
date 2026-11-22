'use client';
import { useEffect, useMemo, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_VOICE_PREFS, listVoiceOptions, loadVoicePrefs, pickVoice, saveVoicePrefs, speak, stopSpeaking,
  type VoiceGender, type VoicePrefs,
} from '@/lib/voice';

/** Settings card: choose the voice (female / male), speed and pitch used in the voice call. */
export function VoiceSettings() {
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setPrefs(loadVoicePrefs());
    if (typeof window === 'undefined' || !window.speechSynthesis) { setSupported(false); return; }
    const synth = window.speechSynthesis;
    const load = () => setVoices(synth.getVoices());
    load();
    synth.addEventListener('voiceschanged', load);
    return () => { synth.removeEventListener('voiceschanged', load); stopSpeaking(); };
  }, []);

  const update = (patch: Partial<VoicePrefs>) => setPrefs((current) => { const next = { ...current, ...patch }; saveVoicePrefs(next); return next; });
  const options = useMemo(() => listVoiceOptions(voices), [voices]);
  const visible = options.filter((o) => prefs.gender === 'any' || o.gender === prefs.gender || o.gender === 'unknown');
  const active = pickVoice(voices, prefs, 'hello');

  function preview() {
    speak('Hello! I am your assistant. How can I help you today?', prefs, {});
  }

  if (!supported) return <section className="card p-5"><h2 className="font-bold">Voice</h2><p className="mt-1 text-sm text-muted-foreground">This browser cannot speak out loud. Try Chrome or Edge.</p></section>;

  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="font-bold">Voice</h2><p className="mt-1 text-sm text-muted-foreground">The voice that reads answers aloud during a voice call.</p></div>
        <Volume2 className="h-5 w-5 text-primary" />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Voice type</p>
        <div className="grid grid-cols-3 gap-2">
          {([['female', 'Female'], ['male', 'Male'], ['any', 'Any']] as [VoiceGender, string][]).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={prefs.gender === value} onClick={() => update({ gender: value, voiceURI: '' })}
              className={cn('rounded-xl border p-2.5 text-sm font-medium transition', prefs.gender === value ? 'border-primary bg-accent text-accent-foreground' : 'border-border hover:bg-muted')}>{label}</button>
          ))}
        </div>
      </div>

      <label className="block space-y-1 text-sm font-semibold">Choose a voice
        <select className="input mt-1" value={prefs.voiceURI} onChange={(e) => update({ voiceURI: e.target.value })}>
          <option value="">Automatic – best {prefs.gender === 'any' ? '' : prefs.gender + ' '}voice{active ? ` (${active.name})` : ''}</option>
          {visible.map((o) => <option key={o.voice.voiceURI} value={o.voice.voiceURI}>{o.label}</option>)}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">Speed: {prefs.rate.toFixed(2)}×
          <input type="range" min={0.6} max={1.4} step={0.05} value={prefs.rate} onChange={(e) => update({ rate: Number(e.target.value) })} className="mt-2 w-full accent-[hsl(var(--primary))]" />
        </label>
        <label className="block text-sm font-semibold">Pitch: {prefs.pitch.toFixed(2)}
          <input type="range" min={0.7} max={1.3} step={0.05} value={prefs.pitch} onChange={(e) => update({ pitch: Number(e.target.value) })} className="mt-2 w-full accent-[hsl(var(--primary))]" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-outline" onClick={preview}><Volume2 className="h-4 w-4" />Preview voice</button>
        <p className="text-xs text-muted-foreground">Tip: for the most natural voices use Microsoft Edge (voices marked “Natural”) or Chrome on Android (“HD”). Saved on this device.</p>
      </div>
    </section>
  );
}
