import Link from 'next/link';
import { ArrowUpRight, ClipboardList, Presentation } from 'lucide-react';
import { MobileTopBar } from '@/components/chat/AppShell';
import { requireUserPage } from '@/lib/auth';
import { getFeatureFlags, stateFor } from '@/lib/features';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Education' };

export default async function EducationPage() {
  const { profile, isAdmin } = await requireUserPage();
  const flags = await getFeatureFlags();
  const presentation = flags.find((item) => item.key === 'presentations');
  const test = flags.find((item) => item.key === 'teacher_tests');

  const cards = [
    {
      title: 'Presentation Builder',
      description: 'Turn a topic or outline into a polished presentation. Edit slides and export your deck.',
      href: '/tools/presentations',
      Icon: Presentation,
      state: presentation ? stateFor(presentation, profile.plan, isAdmin) : 'coming_soon',
      plan: presentation?.min_plan ?? 'pro',
    },
    {
      title: 'Test Generator',
      description: 'Create quizzes, exam papers and answer keys from a topic or your study material.',
      href: '/test-studio',
      Icon: ClipboardList,
      state: test ? stateFor(test, profile.plan, isAdmin) : 'coming_soon',
      plan: test?.min_plan ?? 'pro',
    },
  ] as const;

  return (
    <>
      <MobileTopBar title="Education" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-5 py-7 sm:py-9">
          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Education tools</h1>
            <p className="mt-1 text-sm text-muted-foreground">Build learning materials with AI.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {cards.map(({ title, description, href, Icon, state, plan }) => (
              <Link key={title} href={href} className="group rounded-xl border border-border bg-card p-5 transition hover:border-primary/60 hover:bg-muted/50">
                <div className="mb-5 flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {state === 'active' ? 'Available' : state === 'locked_plan' ? ('Requires ' + plan) : 'Coming soon'}
                    <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                </div>
                <h2 className="text-base font-semibold">{title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
