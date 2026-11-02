import { Flame } from 'lucide-react';

export function StreakLabel({ weeks }: { weeks: number }) {
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-accent-ink">
      <Flame className="h-4 w-4" aria-hidden />
      {weeks}-week streak
    </span>
  );
}
