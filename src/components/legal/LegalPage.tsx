import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
export type LegalBlock = { heading:string; paragraphs?:string[]; bullets?:string[]; links?:{label:string;href:string}[]; };
const LINKS=[['/privacy','Privacy'],['/terms','Terms'],['/refunds','Refunds'],['/cookies','Cookies'],['/acceptable-use','Acceptable use'],['/contact','Contact']] as const;
export function LegalPage({title,description,blocks}:{title:string;description:string;blocks:LegalBlock[]}) {
  const support=process.env.SUPPORT_EMAIL?.trim()||'contact@ilmai.online';
  const feedback=process.env.FEEDBACK_EMAIL?.trim()||'feedback@ilmai.online';
  const privacy=process.env.PRIVACY_CONTACT_EMAIL?.trim()||'contact@ilmai.online';
  return <main className="min-h-dvh bg-background">
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5"><Logo/><Link href="/pricing" className="btn-outline text-sm">Pricing</Link></header>
    <article className="mx-auto max-w-3xl px-5 pb-14 pt-8">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Ilm AI · Legal information</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</p>
      <p className="mt-3 text-xs text-muted-foreground">Last updated: 21 November 2026</p>
      <div className="mt-8 space-y-8">
        {blocks.map((block,index)=><section key={block.heading}>
          <h2 className="text-lg font-bold">{index+1}. {block.heading}</h2>
          {block.paragraphs?.map((paragraph,i)=><p key={i} className="mt-3 leading-7 text-muted-foreground">{paragraph}</p>)}
          {block.bullets&&<ul className="mt-3 list-disc space-y-2 pl-5 leading-7 text-muted-foreground">{block.bullets.map((item,i)=><li key={i}>{item}</li>)}</ul>}
        </section>)}
      </div>
      <div className="mt-12 border-t border-border pt-6">
        <p className="text-sm leading-6 text-muted-foreground">Questions about this page? <a className="font-semibold text-primary hover:underline" href={'mailto:'+support}>Contact support</a>. For product ideas, <a className="font-semibold text-primary hover:underline" href={'mailto:'+feedback}>send feedback</a>. For privacy requests, email <a className="font-semibold text-primary hover:underline" href={'mailto:'+privacy}>{privacy}</a>.</p>
        <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">{LINKS.map(([href,label])=><Link key={href} href={href} className="text-muted-foreground hover:text-foreground">{label}</Link>)}</nav>
        <p className="mt-4 text-xs text-muted-foreground">© {new Date().getFullYear()} Ilm AI. Thank you for using Ilm AI.</p>
      </div>
    </article>
  </main>;
}