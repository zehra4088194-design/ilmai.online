import Link from 'next/link';
import { Check, Sparkles, ArrowRight, Zap } from 'lucide-react';
import { adminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Pricing | Ilm AI', description: 'Explore Ilm AI plans and choose the right AI workspace plan for you.' };
export const dynamic = 'force-dynamic';

type Plan = {
  id:string; name:string; description:string; currency:string; price_amount:number;
  credits_per_period:number; period_days:number; active:boolean; display_features:string[]; sort_order:number;
};

function priceLabel(plan:Plan) {
  const price=Number(plan.price_amount ?? 0);
  if(price<=0) return plan.id==='free'?'Free':'Pricing coming soon';
  return new Intl.NumberFormat('en-PK',{style:'currency',currency:plan.currency,maximumFractionDigits:price%1?2:0}).format(price);
}

export default async function PricingPage() {
  const {data,error}=await adminClient().from('billing_plans')
    .select('id,name,description,currency,price_amount,credits_per_period,period_days,active,display_features,sort_order')
    .order('sort_order');
  const plans=(error?[]:(data??[])) as Plan[];
  const shown=plans.length?plans:[{id:'free',name:'Free',description:'Try Ilm AI and explore the workspace.',currency:'PKR',price_amount:0,credits_per_period:0,period_days:30,active:true,display_features:['Core chat access subject to limits'],sort_order:0} as Plan];
  return <main className="min-h-dvh bg-background">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
      <Link href="/" className="text-lg font-extrabold tracking-tight">Ilm AI</Link>
      <nav className="flex items-center gap-2"><Link href="/login" className="btn-ghost">Sign in</Link><Link href="/signup" className="btn-primary">Get started</Link></nav>
    </header>
    <section className="mx-auto max-w-6xl px-5 pb-16 pt-10">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <span className="badge mb-3"><Sparkles className="h-3.5 w-3.5"/> Plans for every workflow</span>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Simple, transparent pricing</h1>
        <p className="mt-3 text-muted-foreground">Start free. Upgrade when you need more AI power and creative tools.</p>
      </div>
      <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
        {shown.map((plan)=>{
          const features=Array.isArray(plan.display_features)?plan.display_features:[];
          const ready=plan.active;
          const price=priceLabel(plan);
          const popular=plan.id==='pro';
          return <article key={plan.id} className={`card relative flex flex-col p-6 ${popular?'border-primary shadow-glow':''}`}>
            {popular&&<span className="badge absolute -top-3 left-1/2 -translate-x-1/2">Popular</span>}
            <h2 className="text-xl font-bold">{plan.name}</h2>
            <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
            <div className="mt-5"><p className="text-3xl font-extrabold">{price}</p>{Number(plan.price_amount)>0&&<p className="text-xs text-muted-foreground">per {plan.period_days} days</p>}</div>
            <p className="mt-3 rounded-xl bg-muted/70 px-3 py-2 text-sm">{plan.credits_per_period>0?new Intl.NumberFormat().format(plan.credits_per_period)+' credits each period':plan.id==='free'?'Free access with usage limits':'Credits details announced soon'}</p>
            <ul className="my-5 flex-1 space-y-2 text-sm">{features.map((feature,i)=><li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary"/><span>{feature}</span></li>)}</ul>
            {ready?<Link href="/signup" className={popular?'btn-primary w-full justify-center':'btn-outline w-full justify-center'}>{plan.id==='free'?'Start for free':'Choose '+plan.name}<ArrowRight className="h-4 w-4"/></Link>:<button disabled className="btn-outline w-full justify-center opacity-70">Coming soon</button>}
          </article>;
        })}
      </div>
      <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-border p-5 text-center">
        <Zap className="mx-auto mb-2 h-5 w-5 text-primary"/>
        <h2 className="font-bold">Need something specific?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Plans, credit amounts and included features are managed centrally and will update here when configured.</p>
      </div>
    </section>
    <footer className="border-t border-border/60 px-5 py-7 text-center text-sm text-muted-foreground">© {new Date().getFullYear()} Ilm AI · <Link href="/" className="hover:text-foreground">Home</Link></footer>
  </main>;
}
