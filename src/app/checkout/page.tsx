import Link from 'next/link';
import { PaddleCheckout } from '@/components/billing/PaddleCheckout';

export const dynamic='force-dynamic';
export const metadata={title:'Secure checkout | Ilm AI',robots:{index:false,follow:false}};

export default function CheckoutPage() {
  const token=process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN??'';
  const environment=process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT??'production';
  return <main className="grid min-h-dvh place-items-center bg-background px-5 py-10">
    <section className="card w-full max-w-lg p-7 text-center sm:p-9">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Ilm AI · Secure checkout</p>
      <h1 className="mt-3 text-2xl font-extrabold">Complete your purchase</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Your secure Paddle checkout should open automatically. Complete payment in the Paddle window to activate your plan and AI credits.</p>
      <PaddleCheckout token={token} environment={environment}/>
      <div className="mt-7 border-t border-border pt-5">
        <p className="text-xs text-muted-foreground">Your plan is activated only after Paddle confirms the payment. Do not close an active payment window before the provider confirms its result.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm">
          <Link href="/plans" className="btn-outline">Back to billing</Link>
          <Link href="/contact" className="btn-ghost">Get support</Link>
        </div>
      </div>
    </section>
  </main>;
}
