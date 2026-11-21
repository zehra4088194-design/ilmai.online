import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

export type LegalBlock = {
  heading:string;
  paragraphs?:string[];
  bullets?:string[];
};

const LINKS=[
  ['/privacy','Privacy'],['/terms','Terms'],['/refunds','Refunds'],['/cookies','Cookies'],
  ['/acceptable-use','Acceptable use'],['/contact','Contact'],
] as const;

export function LegalPage({title,description,blocks}:{title:string;description:string;blocks:LegalBlock[]}) {
  const operator=process.env.LEGAL_ENTITY_NAME?.trim()??'';
  const support=process.env.SUPPORT_EMAIL?.trim()||'contact@ilmai.online';
  const feedback=process.env.FEEDBACK_EMAIL?.trim()||'feedback@ilmai.online';
  const privacy=process.env.PRIVACY_CONTACT_EMAIL?.trim()||support;
  const address=process.env.LEGAL_POSTAL_ADDRESS?.trim()??'';
  const governingLaw=process.env.LEGAL_GOVERNING_LAW?.trim()??'';
  const regions=process.env.LEGAL_DATA_REGIONS?.trim()??'';
  const detailsReady=!!operator&&!!support&&!!privacy&&!!address&&!!governingLaw&&!!regions;

  return <main className="min-h-dvh bg-background">
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5">
      <Logo/>
      <Link href="/pricing" className="btn-outline text-sm">Pricing</Link>
    </header>
    <article className="mx-auto max-w-3xl px-5 pb-14 pt-8">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Ilm AI · Legal information</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</p>
      <p className="mt-3 text-xs text-muted-foreground">Last updated: 21 November 2026</p>

      {!detailsReady&&<aside className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <p className="font-semibold">Operator details need completion before launch</p>
        <p className="mt-1 text-muted-foreground">The service owner must add the legal business name, postal address, contact emails, governing law and actual hosting regions in the deployment environment. This page does not guess those details.</p>
      </aside>}

      <section className="mt-8 rounded-2xl border border-border bg-card p-4 text-sm">
        <h2 className="font-bold">Service operator and contact details</h2>
        <dl className="mt-3 grid gap-2 sm:grid-cols-[150px_1fr]">
          <dt className="text-muted-foreground">Operator</dt><dd>{operator||'Not yet configured'}</dd>
          <dt className="text-muted-foreground">Postal address</dt><dd className="whitespace-pre-line">{address||'Not yet configured'}</dd>
          <dt className="text-muted-foreground">Support</dt><dd><a className="hover:text-primary hover:underline" href={'mailto:'+support}>{support}</a></dd>
          <dt className="text-muted-foreground">Feedback</dt><dd><a className="hover:text-primary hover:underline" href={'mailto:'+feedback}>{feedback}</a></dd>
          <dt className="text-muted-foreground">Privacy enquiries</dt><dd><a className="hover:text-primary hover:underline" href={'mailto:'+privacy}>{privacy}</a></dd>
          <dt className="text-muted-foreground">Governing law</dt><dd>{governingLaw||'Not yet configured'}</dd>
          <dt className="text-muted-foreground">Data hosting regions</dt><dd>{regions||'Not yet confirmed by the operator'}</dd>
        </dl>
        <div className="mt-3 flex flex-wrap gap-4"><a className="font-semibold text-primary hover:underline" href={'mailto:'+support}>Email support</a><a className="font-semibold text-primary hover:underline" href={'mailto:'+feedback}>Send feedback</a></div>
      </section>

      <div className="mt-8 space-y-8">
        {blocks.map((block,index)=><section key={block.heading}>
          <h2 className="text-lg font-bold">{index+1}. {block.heading}</h2>
          {block.paragraphs?.map((paragraph,i)=><p key={i} className="mt-3 leading-7 text-muted-foreground">{paragraph}</p>)}
          {block.bullets&&<ul className="mt-3 list-disc space-y-2 pl-5 leading-7 text-muted-foreground">{block.bullets.map((item,i)=><li key={i}>{item}</li>)}</ul>}
        </section>)}
      </div>

      <div className="mt-12 border-t border-border pt-6">
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {LINKS.map(([href,label])=><Link key={href} href={href} className="text-muted-foreground hover:text-foreground">{label}</Link>)}
        </nav>
        <p className="mt-4 text-xs text-muted-foreground">© {new Date().getFullYear()} Ilm AI. Please read these pages before using paid services.</p>
      </div>
    </article>
  </main>;
}
