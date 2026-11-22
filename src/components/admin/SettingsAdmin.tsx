'use client';
import { useState } from 'react';
import { Save } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { api } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import type { AppSettings } from '@/lib/settings';

const NUM: { key: keyof AppSettings; label: string; hint: string }[] = [
  { key: 'default_credits', label: 'Credits on sign-up', hint: 'Given once to every new user' },
  { key: 'daily_free_credits', label: 'Daily free top-up', hint: 'Free-plan users are topped up to this balance by the daily cron' },
  { key: 'credits_per_usd', label: 'Credits per $1 of provider cost', hint: '10000 → 1 credit = $0.0001. Raise it to charge users more per message' },
  { key: 'min_credits_per_msg', label: 'Minimum credits per message', hint: 'Floor price, even for free models' },
  { key: 'max_history_messages', label: 'Messages of history sent to the model', hint: 'Lower = cheaper' },
  { key: 'max_upload_mb', label: 'Max upload size (MB)', hint: 'For images / PDFs' },
  { key: 'max_parallel_models', label: 'Models answering at once', hint: 'AI-Fiesta-style multi-model chat (1 = single model)' },
  { key: 'suggestions_per_day', label: 'Suggestions per user per day', hint: 'Shared helper-model quota' },
  { key: 'quizzes_per_day', label: 'Quizzes per user per day', hint: 'Shared helper-model quota' },
  { key: 'quiz_max_questions', label: 'Max questions per quiz', hint: 'Hard cap for the quiz builder' },
];

export function SettingsAdmin({ initial }: { initial: AppSettings }) {
  const [s, setS] = useState(initial);
  const toast = useToast();

  const save = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    try {
      await api('/api/admin/settings', 'PATCH', { key, value });
      toast('Saved', 'ok');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed', 'err');
    }
  };

  const upd = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setS((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-5">
      <section className="card divide-y divide-border">
        <div className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="font-bold">Maintenance mode</p>
            <p className="text-sm text-muted-foreground">Non-admin users see a “we’ll be right back” screen and the API refuses chats.</p>
          </div>
          <Switch checked={s.maintenance_mode} label="Maintenance" onChange={(value) => { upd('maintenance_mode', value); save('maintenance_mode', value); }} />
        </div>
        <div className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="font-bold">Allow new sign-ups</p>
            <p className="text-sm text-muted-foreground">Hides the sign-up form. (To block it completely also disable sign-ups in Supabase → Auth settings.)</p>
          </div>
          <Switch checked={s.signups_enabled} label="Signups" onChange={(value) => { upd('signups_enabled', value); save('signups_enabled', value); }} />
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="font-bold">Announcement banner</p>
          <Switch checked={s.announcement.enabled} label="Announcement" onChange={(value) => {
            const announcement = { ...s.announcement, enabled: value };
            upd('announcement', announcement);
            save('announcement', announcement);
          }} />
        </div>
        <div className="flex gap-2">
          <input className="input" placeholder="e.g. Exams week: all models are free until Friday!" value={s.announcement.text}
            onChange={(event) => upd('announcement', { ...s.announcement, text: event.target.value })} />
          <button className="btn-primary" onClick={() => save('announcement', s.announcement)}><Save className="h-4 w-4" /></button>
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <p className="font-bold">Credits & limits</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {NUM.map(({ key, label, hint }) => (
            <label key={key} className="block">
              <span className="text-sm font-semibold">{label}</span>
              <div className="mt-1 flex gap-2">
                <input type="number" className="input" value={s[key] as number}
                  onChange={(event) => upd(key, Number(event.target.value) as never)} />
                <button className="btn-outline" onClick={() => save(key, s[key] as never)}><Save className="h-4 w-4" /></button>
              </div>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <p className="font-bold">Utility models (Suggestions, Quiz &amp; Prompt Enhance)</p>
        <p className="text-sm text-muted-foreground">
          Use <code>openrouter/free</code> for OpenRouter’s live free-model router, or pin model IDs separated by commas.
          After pinned IDs, Ilm AI automatically tries the best two enabled free text models and then up to three enabled
          low-cost paid text models (average input/output price at or below $0.60 per 1M tokens). Paid fallbacks are an
          application expense; they are never deducted from a user’s wallet.
        </p>
        <div className="flex gap-2">
          <input className="input" placeholder="openrouter/free" value={s.utility_models}
            onChange={(event) => upd('utility_models', event.target.value)} />
          <button className="btn-outline" onClick={() => save('utility_models', s.utility_models)}><Save className="h-4 w-4" /></button>
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <p className="font-bold">Branding & AI behaviour</p>
        <label className="block">
          <span className="text-sm font-semibold">Site name</span>
          <div className="mt-1 flex gap-2">
            <input className="input" value={s.site_name} onChange={(event) => upd('site_name', event.target.value)} />
            <button className="btn-outline" onClick={() => save('site_name', s.site_name)}><Save className="h-4 w-4" /></button>
          </div>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">System prompt (sent with every chat)</span>
          <textarea className="input mt-1 min-h-32" value={s.system_prompt}
            onChange={(event) => upd('system_prompt', event.target.value)} />
          <button className="btn-primary mt-2" onClick={() => save('system_prompt', s.system_prompt)}><Save className="h-4 w-4" />Save prompt</button>
        </label>
      </section>
    </div>
  );
}
