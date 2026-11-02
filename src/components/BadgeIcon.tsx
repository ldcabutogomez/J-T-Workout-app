import { CalendarCheck, CalendarDays, Crown, Dumbbell, Flame, Medal, PartyPopper, Rocket, Star, Trophy, Zap, type LucideIcon } from 'lucide-react';
import type { BadgeIconKey } from '../engine/achievements';

const ICONS: Record<BadgeIconKey, LucideIcon> = {
  rocket: Rocket,
  flame: Flame,
  dumbbell: Dumbbell,
  medal: Medal,
  trophy: Trophy,
  star: Star,
  party: PartyPopper,
  calendar: CalendarDays,
  'calendar-check': CalendarCheck,
  zap: Zap,
  crown: Crown,
};

/** Line-icon tile for a badge; muted until earned. */
export function BadgeIcon({ name, earned, size = 'md' }: { name: BadgeIconKey; earned: boolean; size?: 'md' | 'lg' }) {
  const Icon = ICONS[name];
  const box = size === 'lg' ? 'h-12 w-12' : 'h-10 w-10';
  const glyph = size === 'lg' ? 'h-6 w-6' : 'h-5 w-5';
  return (
    <span aria-hidden className={`flex ${box} shrink-0 items-center justify-center rounded-full ${earned ? 'bg-accent text-on-accent' : 'bg-sunk text-muted'}`}>
      <Icon className={glyph} strokeWidth={2} />
    </span>
  );
}
