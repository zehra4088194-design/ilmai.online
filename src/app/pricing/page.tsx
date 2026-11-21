import Link from 'next/link';
import { Check, Sparkles, ArrowRight, Zap, CreditCard, Wallet, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { adminClient } from '@/lib/supabase/admin';

export const metadata={title:'Pricing | Ilm AI',description:'Choose an Ilm AI plan. Plan features, prices, billing periods and AI credits are managed by the Ilm AI team.'};
export const dynamic='force-dynamic';

type Plan={
  id:string;name:string;description:string;currency:string;price_amount:number;
  credits_per_period:number;period_days:number;active:boolean;display_features:string[];sort_order:number;
  paddle_price_id:string|null;paypro_enabled:boolean;
};

function priceLabel(plan:Plan) {
  const amount=Number(plan.price_amount??0);
  if(plan.id==='free'&&amount===0)return 'Free';
  if(amount<=0)return 'Not configured';
  return new Intl.NumberFormat('en-PK',{style:'currency',currency:plan.currency,maximumFractionDigits:amount%1?2:0}).format(amount);
}
function periodLabel(days:number) {
  if(days===30)return 'per 30 days';
  if(days===365)return 'per year';
  return 'per '+days+' days';
}

export default async function PricingPage() {
  const {data,error}=await adminClient().from('billing_plans')
    .select('id,name,description,currency,price_amount,credits_per_period,period_days,active,display_features,sort_order,paddle_price_id,paypro_enabled')
    .order('sort_order');
  const plans=(error?[]:(data??[])) as Plan[];
  const shown=plans.length?plans:[{
    id:'free',name:'Free',description:'Explore Ilm AI and try the workspace.',currency:'PKR',price_amount:0,
    credits_per_period:0,period_days:30,active:true,display_features:['Core chat access subject to usage limits'],
    sort_order:0,paddle_price_id:null,paypro_enabled:false,
  } as Plan];
  const paddleConfigured=!!process.env.PADDLE_API_KEY&&!!process.env.PADDLE_WEBHOOK_SECRET&&['sandbox','production'].includes(process.env.PADDLE_ENVIRONMENT??'');
  const payproConfigured=!!process.env.PAYPRO_MERCHANT_NO&&!!process.env.PAYPRO_APP_SECRET&&!!process.env.PAYPRO_API_BASE_URL;

  return <main className="min-h-dvh bg-background">
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
      <Logo/>
      <nav className="flex items-center gap-2"><Link href="/login?next=%2Fplans" className="btn-ghost">Sign in</Link><Link href="/signup?next=%2Fplans" className="btn-primary">Get started</Link></nav>
    </header>
    <section className="mx-auto max-w-6xl px-5 pb-16 pt-10">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <span className="badge mb-3"><Sparkles className="h-3.5 w-3.5"/> Plans for every workflow</span>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Clear plans. More room to create.</h1>
        <p className="mt-3 text-muted-foreground">Choose a plan based on its included AI credits, tools and billing period. The amounts below are read directly from the live plan catalogue.</p>
      </div>
      <div className="mx-auto grid max-w-5xl items-stretch gap-5 md:grid-cols-3">
        {shown.map((plan)=>{
          const features=Array.isArray(plan.display_features)?plan.display_features:[];
          const paid=plan.id!=='free';
          const paddleReady=paid&&plan.active&&plan.currency==='USD'&&!!plan.paddle_price_id&&paddleConfigured;
          const payproReady=paid&&plan.active&&plan.currency==='PKR'&&!!plan.paypro_enabled&&payproConfigured;
          const purchasable=plan.id==='free'?plan.active:(paddleReady||payproReady);
          const price=priceLabel(plan);
          const popular=plan.id==='pro';
          return <article key={plan.id} className={`card relative flex flex-col p-6 ${popular?'border-primary shadow-glow':''}`}>
            {popular&&<span className="badge absolute -top-3 left-1/2 -translate-x-1/2">Popular</span>}
            <h2 className="text-xl font-bold">{plan.name}</h2>
            <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
            <div className="mt-5"><p className="text-3xl font-extrabold tabular-nums">{price}</p>{Number(plan.price_amount)>0&&<p className="mt-1 text-xs text-muted-foreground">{periodLabel(plan.period_days)}</p>}</div>
            <div className="mt-4 rounded-xl bg-muted/70 px-3 py-3">
              <p className="text-xs text-muted-foreground">AI credits per plan period</p>
              <p className="mt-1 text-lg font-bold tabular-nums">{Number(plan.credits_per_period)>0?Number(plan.credits_per_period).toLocaleString():'Not configured'}</p>
            </div>
            <ul className="my-5 flex-1 space-y-2 text-sm">
              {features.map((feature,i)=><li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary"/><span>{feature}</span></li>)}
            </ul>
            <div className="space-y-2">
              {paddleReady&&<p className="flex items-center gap-2 text-xs text-muted-foreground"><CreditCard className="h-3.5 w-3.5"/>Paddle checkout available (USD)</p>}
              {payproReady&&<p className="flex items-center gap-2 text-xs text-muted-foreground"><Wallet className="h-3.5 w-3.5"/>JazzCash / Easypaisa via PayPro (PKR)</p>}
              {purchasable
                ?<Link href={plan.id==='free'?'/signup?next=%2Fplans':'/login?next=%2Fplans'} className={`${popular?'btn-primary':'btn-outline'} w-full justify-center`}>{plan.id==='free'?'Start for free':'Continue to checkout options'}<ArrowRight className="h-4 w-4"/></Link>
                :<button disabled className="btn-outline w-full justify-center opacity-70">{plan.active?'Payment setup pending':'Coming soon'}</button>}
            </div>
          </article>;
        })}
      </div>
      <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-border p-5 text-center">
        <ShieldCheck className="mx-auto mb-2 h-5 w-5 text-primary"/>
        <h2 className="font-bold">Secure payment and transparent credits</h2>
        <p className="mt-1 text-sm text-muted-foreground">Plans, prices, AI credit amounts, included features and periods are maintained in Admin → Plans & discounts. Taxes or provider-specific checkout totals may be shown by the payment provider before you confirm.</p>
        <p className="mt-3 text-xs text-muted-foreground">Credits are usage units, not cash or a fixed count of model tokens. Actual usage depends on the selected model and feature.</p>
      </div>
    </section>
    <footer className="border-t border-border/60 px-5 py-7">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
        <span>© {new Date().getFullYear()} Ilm AI</span>
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/refunds" className="hover:text-foreground">Refunds</Link>
          <Link href="/cookies" className="hover:text-foreground">Cookies</Link>
          <Link href="/acceptable-use" className="hover:text-foreground">Acceptable use</Link>
          <Link href="/contact" className="hover:text-foreground">Contact</Link>
        </nav>
      </div>
    </footer>
  </main>;
}
