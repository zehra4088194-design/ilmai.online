import type { AppSettings } from '@/lib/settings';
import type { Mode } from '@/lib/modes';

/** Builds the system prompt: global prompt + active mode + who the user is. */
export function buildSystemPrompt(opts: {
  settings: AppSettings;
  mode?: Mode | null;
  audience: 'student' | 'teacher';
  grade?: string | null;
}) {
  const parts = [opts.settings.system_prompt];
  if (opts.mode?.system_prompt) parts.push(`Active mode: ${opts.mode.name}.\n${opts.mode.system_prompt}`);
  parts.push(
    opts.audience === 'teacher'
      ? `The user is a teacher${opts.grade ? ` (teaches ${opts.grade})` : ''}. Treat them as a fellow educator and give practical, classroom-ready output.`
      : `The user is a student${opts.grade ? ` in ${opts.grade}` : ''}. Keep explanations level-appropriate and encouraging.`,
  );
  parts.push('Format answers in Markdown. Write maths in plain text (x^2, sqrt(x), a/b) – do not use LaTeX. Reply in the same language and script the user writes in (English, Urdu or Roman Urdu).');
  return parts.join('\n\n');
}
