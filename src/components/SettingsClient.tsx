'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Save, Loader2, RotateCcw, Palette, Sun, Moon, Monitor, Paintbrush2, UserRound, Volume2, Shield } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/providers';
import { ACCENTS, DEFAULT_APPEARANCE, LOADERS, NEUTRAL_ACCENT, THEME_FAMILIES, useAppearance, type Appearance } from '@/components/providers';
import { LoaderGraphic } from '@/components/chat/LoadingIndicator';
import { VoiceSettings } from '@/components/VoiceSettings';

type SettingsSection = 'profile' | 'appearance' | 'voice' | 'account';

const sections: { id: SettingsSection; label: string; Icon: typeof UserRound }[] = [
  { id: 'profile', label: 'Profile', Icon: UserRound },
  { id: 'appearance', label: 'Appearance', Icon: Palette },
  { id: 'voice', label: 'Voice', Icon: Volume2 },
  { id: 'account', label: 'Account', Icon: Shield },
];

export function SettingsClient({ id, name: initial, preferences }: { id: string; name: string; preferences: Record<string, unknown> }) {
  const [name, setName] = useState(initial);
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');
  const [profileBusy, setProfileBusy] = useState(false);
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const { appearance, updateAppearance } = useAppearance();
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    try {
      if (!localStorage.getItem('ilm-appearance') && preferences?.appearance && typeof preferences.appearance === 'object') {
        updateAppearance({ ...DEFAULT_APPEARANCE, ...preferences.appearance as Partial<Appearance> });
      }
    } catch { /* storage unavailable */ }
  }, [preferences, updateAppearance]);

  async function saveProfile() {
    setProfileBusy(true);
    const { error } = await createClient().from('profiles').update({ full_name: name }).eq('id', id);
    setProfileBusy(false);
    if (error) { toast('Could not save profile: ' + error.message, 'err'); return; }
    toast('Profile saved', 'ok');
    router.refresh();
  }

  async function saveAppearance() {
    setAppearanceBusy(true);
    const { error } = await createClient().from('profiles').update({ preferences: { ...preferences, appearance } }).eq('id', id);
    setAppearanceBusy(false);
    if (error) { toast('Could not save appearance: ' + error.message, 'err'); return; }
    toast('Appearance saved to your account', 'ok');
    router.refresh();
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  function resetAppearance() {
    updateAppearance(DEFAULT_APPEARANCE);
    toast('Appearance reset to the default look. Save to account to sync it across devices.', 'info');
  }

  const modes = [
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark', label: 'Dark', Icon: Moon },
    { value: 'system', label: 'System', Icon: Monitor },
  ] as const;
  const headings = [
    { value: 'auto', label: 'Theme colour' },
    { value: '#8b5cf6', label: 'Violet' },
    { value: '#e11d48', label: 'Rose' },
    { value: '#d97706', label: 'Amber' },
    { value: '#059669', label: 'Emerald' },
    { value: '#0284c7', label: 'Sky' },
    { value: '#c026d3', label: 'Fuchsia' },
  ];

  return (
    <div className="space-y-4">
      <nav aria-label="Settings sections" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {sections.map(({ id: sectionId, label, Icon }) => (
          <button key={sectionId} type="button" onClick={() => setActiveSection(sectionId)} aria-current={activeSection === sectionId ? 'page' : undefined}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${activeSection === sectionId ? 'border-primary bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </nav>

      {activeSection === 'profile' && (
        <section className="card space-y-4 p-5">
          <div><h2 className="font-bold">Profile details</h2><p className="mt-1 text-sm text-muted-foreground">Manage the name shown across Ilm AI.</p></div>
          <label className="block space-y-1 text-sm font-medium">Display name
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
          </label>
          <div><button className="btn-primary" onClick={saveProfile} disabled={profileBusy}>{profileBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save profile</button></div>
        </section>
      )}

      {activeSection === 'appearance' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1"><Palette className="h-5 w-5 text-primary" /><div><h2 className="font-bold">Appearance</h2><p className="text-sm text-muted-foreground">Personalise the theme, colours and how answers look.</p></div></div>

          <section className="card space-y-4 p-5">
            <div><h3 className="font-semibold">Theme</h3><p className="mt-1 text-xs text-muted-foreground">Choose light, dark or system appearance and a theme collection.</p></div>
            <div><p className="mb-2 text-sm font-medium">Theme mode</p><div className="grid grid-cols-3 gap-2">{modes.map(({ value, label, Icon }) => <button key={value} type="button" onClick={() => updateAppearance({ mode: value })} aria-pressed={appearance.mode === value} className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-sm transition ${appearance.mode === value ? 'border-primary bg-accent text-accent-foreground' : 'border-border hover:bg-muted'}`}><Icon className="h-4 w-4" />{label}</button>)}</div></div>
            <div><p className="mb-2 text-sm font-medium">Theme collection</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{THEME_FAMILIES.map((theme) => <button key={theme.id} type="button" onClick={() => updateAppearance({ family: theme.id, accent: theme.id === 'classic' ? NEUTRAL_ACCENT : theme.swatches[1], monochrome: false })} aria-pressed={appearance.family === theme.id} className={`rounded-xl border p-2.5 text-left transition hover:-translate-y-0.5 ${appearance.family === theme.id ? 'border-primary ring-1 ring-primary/40' : 'border-border'}`}><span className="mb-2 flex h-8 overflow-hidden rounded-lg">{theme.swatches.map((color, index) => <span key={index} className="flex-1" style={{ background: color }} />)}</span><span className="text-xs font-semibold">{theme.label}</span>{appearance.family === theme.id && <span className="ml-1 text-primary">✓</span>}</button>)}</div></div>
          </section>

          <section className="card space-y-4 p-5">
            <div><h3 className="font-semibold">Colours</h3><p className="mt-1 text-xs text-muted-foreground">Set the accent and heading colours used around the app and in answers.</p></div>
            <div><p className="mb-2 text-sm font-medium">Accent colour</p><div className="flex flex-wrap items-center gap-2">{ACCENTS.map((accent) => <button key={accent.id} type="button" onClick={() => updateAppearance({ accent: accent.id, monochrome: accent.id === '#a1a1aa' })} title={accent.label} aria-label={accent.label} aria-pressed={appearance.accent === accent.id} className={`h-8 w-8 rounded-full border border-white/20 ${appearance.accent === accent.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`} style={{ background: accent.swatch }} />)}<label className="flex h-9 items-center gap-2 rounded-full border border-border px-2 text-xs"><span>Custom</span><input type="color" aria-label="Custom accent colour" value={/^#[0-9a-fA-F]{6}$/.test(appearance.accent) ? appearance.accent : '#171717'} onChange={(event) => updateAppearance({ accent: event.target.value, monochrome: false })} className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0" /></label></div><button type="button" onClick={() => updateAppearance({ monochrome: !appearance.monochrome })} className={`mt-2 rounded-lg border px-3 py-2 text-xs ${appearance.monochrome ? 'border-primary bg-accent' : 'border-border'}`}>{appearance.monochrome ? '✓ Monochrome enabled' : 'Use black, white & grey only'}</button></div>
            <div><p className="mb-2 text-sm font-medium">Heading colour</p><div className="flex flex-wrap gap-2">{headings.map((heading) => <button key={heading.value} type="button" onClick={() => updateAppearance({ headingColor: heading.value })} title={heading.label} aria-label={heading.label} aria-pressed={appearance.headingColor === heading.value} className={`h-8 w-8 rounded-full border ${appearance.headingColor === heading.value ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`} style={{ background: heading.value === 'auto' ? 'linear-gradient(135deg,#22c55e,#60a5fa)' : heading.value }} />)}<label className="flex h-8 items-center gap-1 rounded-full border border-border px-2 text-xs">Custom<input type="color" aria-label="Custom heading colour" value={appearance.headingColor === 'auto' ? '#22c55e' : appearance.headingColor} onChange={(event) => updateAppearance({ headingColor: event.target.value })} className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0" /></label></div></div>
          </section>

          <section className="card space-y-4 p-5">
            <div><h3 className="font-semibold">Typography & code</h3><p className="mt-1 text-xs text-muted-foreground">Control the look of text and programming examples in AI answers.</p></div>
            <div><p className="mb-2 text-sm font-medium">AI answer headings</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(['auto', 'handwritten', 'serif', 'minimal'] as const).map((style) => <button key={style} type="button" onClick={() => updateAppearance({ headingStyle: style })} aria-pressed={appearance.headingStyle === style} className={`rounded-xl border p-2 text-sm transition ${appearance.headingStyle === style ? 'border-primary bg-accent' : 'border-border hover:bg-muted'}`}>{style === 'auto' ? 'Automatic' : style === 'handwritten' ? 'Handwritten' : style === 'serif' ? 'Elegant serif' : 'Minimal'}</button>)}</div><p className="mt-2 text-xs text-muted-foreground">Applies to Markdown headings in assistant responses.</p></div>
            <div><p className="mb-2 text-sm font-medium">Font style</p><div className="grid grid-cols-3 gap-2">{([{ value: 'sans', label: 'Clean sans' }, { value: 'serif', label: 'Elegant serif' }, { value: 'mono', label: 'Mono' }] as const).map((font) => <button key={font.value} type="button" onClick={() => updateAppearance({ font: font.value })} aria-pressed={appearance.font === font.value} className={`rounded-xl border p-2.5 transition ${appearance.font === font.value ? 'border-primary bg-accent' : 'border-border'}`}><span className={`block text-xl ${font.value === 'serif' ? 'font-serif' : font.value === 'mono' ? 'font-mono' : ''}`}>Aa</span><span className="text-xs">{font.label}</span></button>)}</div></div>
            <div><p className="mb-2 text-sm font-medium">Code font size</p><div className="grid grid-cols-3 gap-2">{([{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Normal' }, { value: 'large', label: 'Large' }] as const).map((size) => <button key={size.value} type="button" onClick={() => updateAppearance({ codeFontSize: size.value })} aria-pressed={(appearance.codeFontSize ?? 'medium') === size.value} className={`rounded-xl border px-3 py-2 text-sm transition ${(appearance.codeFontSize ?? 'medium') === size.value ? 'border-primary bg-accent' : 'border-border hover:bg-muted'}`}>{size.label}</button>)}</div><p className="mt-1 text-xs text-muted-foreground">Adjust the size of code examples independently from normal text.</p></div>
          </section>

          <section className="card space-y-4 p-5">
            <div><h3 className="font-semibold">Response experience</h3><p className="mt-1 text-xs text-muted-foreground">Choose the animation shown while an AI response is being generated.</p></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{LOADERS.map((loader) => <button key={loader.id} type="button" onClick={() => updateAppearance({ loader: loader.id })} aria-pressed={appearance.loader === loader.id} className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium transition ${appearance.loader === loader.id ? 'border-primary bg-accent text-accent-foreground' : 'border-border hover:bg-muted'}`}><span className="grid h-10 place-items-center"><LoaderGraphic style={loader.id} /></span>{loader.label}</button>)}</div>
          </section>

          <section className="card space-y-3 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold"><Paintbrush2 className="h-4 w-4 text-primary" />Live preview</div>
            <h3 className="text-lg font-bold" style={{ color: appearance.headingColor === 'auto' ? 'hsl(var(--primary))' : appearance.headingColor }}>Beautiful headings for your answers</h3>
            <p className="text-sm text-muted-foreground">Paragraph text · links · <span className="font-semibold text-primary">accent buttons</span></p>
            <div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={saveAppearance} disabled={appearanceBusy}>{appearanceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save appearance</button><button className="btn-outline" onClick={resetAppearance}><RotateCcw className="h-4 w-4" />Reset defaults</button></div>
            <p className="text-xs text-muted-foreground">Your preview applies immediately on this device. Save appearance to sync it to your account and other devices.</p>
          </section>
        </div>
      )}

      {activeSection === 'voice' && (
        <div className="space-y-3"><div className="flex items-center gap-2 px-1"><Volume2 className="h-5 w-5 text-primary" /><div><h2 className="font-bold">Voice</h2><p className="text-sm text-muted-foreground">Choose how Ilm AI reads responses aloud.</p></div></div><VoiceSettings /></div>
      )}

      {activeSection === 'account' && (
        <section className="card space-y-3 p-5">
          <div className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /><div><h2 className="font-bold">Account</h2><p className="text-sm text-muted-foreground">Session and sign-in controls.</p></div></div>
          <div className="rounded-xl border border-border p-3"><p className="text-sm font-semibold">Sign out of Ilm AI</p><p className="mt-1 text-xs text-muted-foreground">This signs you out on this browser.</p><button className="btn-outline mt-3 text-danger" onClick={signOut}><LogOut className="h-4 w-4" />Sign out</button></div>
        </section>
      )}
    </div>
  );
}
