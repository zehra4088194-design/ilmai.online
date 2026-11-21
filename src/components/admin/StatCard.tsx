'use client';
import { motion } from 'framer-motion';
import { Users, UserPlus, Zap, MessageSquare, Hash, DollarSign, Coins, AlertTriangle, Timer, HardDrive, CircleHelp, Target, Trophy, Lightbulb } from 'lucide-react';

const ICONS = { users: Users, userPlus: UserPlus, zap: Zap, messageSquare: MessageSquare, hash: Hash, dollarSign: DollarSign, coins: Coins, alertTriangle: AlertTriangle, timer: Timer, hardDrive: HardDrive, circleHelp: CircleHelp, target: Target, trophy: Trophy, lightbulb: Lightbulb };
type IconName = keyof typeof ICONS;

export function StatCard({ label, value, hint, icon, i = 0 }: { label: string; value: string; hint?: string; icon: IconName; i?: number }) {
  const Icon = ICONS[icon];
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} whileHover={{ y: -3 }} className="card relative overflow-hidden p-4">
      <div className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-primary/10" />
      <div className="relative flex items-start justify-between">
        <div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 truncate text-2xl font-extrabold tracking-tight">{value}</p>{hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}</div>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Icon className="h-[18px] w-[18px]" /></div>
      </div>
    </motion.div>
  );
}
