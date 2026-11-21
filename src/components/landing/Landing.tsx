'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, MessageSquare, Columns, Image as ImageIcon, Video, Presentation, FileText, ArrowRight, ShieldCheck, Zap, Languages } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';

const fade = (i = 0) => ({ initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.6, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] as const } });

const FEATURES = [
  { Icon: MessageSquare, title: 'Every top model', text: 'GPT, Claude, Gemini, Llama, DeepSeek, Grok and hundreds more – one clean chat.' },
  { Icon: Columns, title: 'Compare side by side', text: 'Ask once, watch 2-3 models answer live, and pick the best response.' },
  { Icon: ImageIcon, title: 'Image creation', text: 'Turn ideas into pictures, stored safely in your own library.' },
  { Icon: Video, title: 'Video generation', text: 'Short AI videos from a single prompt.' },
  { Icon: Presentation, title: 'Presentations', text: 'Topic in, polished slide deck out – export to PPTX or PDF.' },
  { Icon: FileText, title: 'Test generator', text: 'Create quizzes, exam papers and answer keys from a topic or your study material.' },
];

export function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="dots pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/pricing" className="btn-ghost hidden sm:inline-flex">Pricing</Link>
          <Link href="/login" className="btn-ghost hidden sm:inline-flex">Sign in</Link>
          <Link href="/signup" className="btn-primary">Get started <ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-5 pb-20 pt-14 text-center sm:pt-24">
        <motion.span {...fade(0)} className="badge mb-6 !px-3.5 !py-1.5"><Sparkles className="h-3.5 w-3.5" /> Your AI workspace for everything</motion.span>
        <motion.h1 {...fade(1)} className="text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl md:text-7xl">
          Every AI model.<br /><span className="text-gradient">One beautiful place.</span>
        </motion.h1>
        <motion.p {...fade(3)} className="mx-auto mt-3 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
          Chat, compare models, create images and video, build presentations, and generate tests — all in one place.
        </motion.p>
        <motion.div {...fade(4)} className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="btn-primary !px-6 !py-3 text-base shadow-glow">Start free <ArrowRight className="h-4 w-4" /></Link>
          <Link href="/login" className="btn-outline !px-6 !py-3 text-base">I already have an account</Link>
        </motion.div>

        {/* floating chat mock */}
        <motion.div {...fade(5)} className="glass mx-auto mt-16 max-w-2xl rounded-3xl p-4 text-left shadow-soft sm:p-5">
          <div className="mb-3 flex items-center gap-1.5">
            {[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-primary/30" />)}
            <span className="ml-3 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">openai/gpt-4o-mini</span>
          </div>
          <div className="ml-auto mb-3 w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">Explain photosynthesis in simple terms</div>
          <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
            className="w-fit max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-sm leading-relaxed">
            Plants use sunlight, water and carbon dioxide to make their own food. This process is called <b>photosynthesis</b> <span className="cursor" />
          </motion.div>
        </motion.div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24">
        <motion.h2 {...fade()} className="mb-10 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">Everything you need, <span className="text-gradient">nothing you don&apos;t</span></motion.h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, text }, i) => (
            <motion.div key={title} {...fade(i)} whileHover={{ y: -6 }} className="card group p-6 transition-shadow hover:shadow-glow">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-accent text-accent-foreground transition group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="h-5 w-5" /></div>
              <h3 className="mb-1.5 font-bold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[{ Icon: Zap, t: 'Fast streaming' }, { Icon: ShieldCheck, t: 'Private by design' }, { Icon: Languages, t: 'Urdu & RTL ready' }].map(({ Icon, t }, i) => (
            <motion.div key={t} {...fade(i)} className="glass flex items-center justify-center gap-3 rounded-2xl px-5 py-4 font-semibold"><Icon className="h-5 w-5 text-primary" />{t}</motion.div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">© {new Date().getFullYear()} Ilm AI · <Link href="/pricing" className="hover:text-foreground">Pricing</Link></footer>
    </div>
  );
}
