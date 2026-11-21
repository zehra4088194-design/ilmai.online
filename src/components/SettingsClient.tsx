'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Save, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AppearancePicker } from '@/components/ui/ThemeControls';
import { useToast } from '@/components/providers';

export function SettingsClient({ id, name: initial }: { id: string; name: string }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function save() {
    setBusy(true);
    const { error } = await createClient().from('profiles').update({ full_name: name }).eq('id', id);
    setBusy(false);
    error ? toast(error.message, 'err') : toast('Saved', 'ok');
    router.refresh();
  }
  async function signOut() {
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-3 p-5">
        <h2 className="font-bold">Profile</h2>
        <label className="block space-y-1 text-sm font-medium">Display name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </label>
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save</button>
      </section>
      <section className="card space-y-3 p-5"><h2 className="font-bold">Accent colour</h2><AppearancePicker /></section>
      <section className="card p-5"><button className="btn-outline text-danger" onClick={signOut}><LogOut className="h-4 w-4" />Sign out</button></section>
    </div>
  );
}
