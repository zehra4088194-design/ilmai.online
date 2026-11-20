'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Save, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AppearancePicker } from '@/components/ui/ThemeControls';
import { useToast } from '@/components/providers';

const GRADES = ['', 'Class 1-5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11 (FSc/FA)', 'Class 12 (FSc/FA)', 'O Level', 'A Level', 'University', 'Other'];

export function SettingsClient({ id, name: initial, audience: aud, grade: gr }: { id: string; name: string; audience: 'student' | 'teacher'; grade: string }) {
  const [name, setName] = useState(initial);
  const [audience, setAudience] = useState(aud);
  const [grade, setGrade] = useState(gr);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function save() {
    setBusy(true);
    const { error } = await createClient().from('profiles').update({ full_name: name, audience, grade: grade || null }).eq('id', id);
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
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">I am a<select className="input mt-1" value={audience} onChange={(e) => setAudience(e.target.value as 'student' | 'teacher')}><option value="student">Student</option><option value="teacher">Teacher</option></select></label>
          <label className="block text-sm font-semibold">{audience === 'teacher' ? 'I teach' : 'My class / level'}<select className="input mt-1" value={grade} onChange={(e) => setGrade(e.target.value)}>{GRADES.map((g) => <option key={g} value={g}>{g || 'Not set'}</option>)}</select></label>
        </div>
        <p className="text-xs text-muted-foreground">The AI uses this to match explanations to your level.</p>
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save</button>
      </section>
      <section className="card space-y-3 p-5"><h2 className="font-bold">Appearance</h2><AppearancePicker /></section>
      <section className="card p-5"><button className="btn-outline text-danger" onClick={signOut}><LogOut className="h-4 w-4" />Sign out</button></section>
    </div>
  );
}
