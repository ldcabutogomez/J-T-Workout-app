import { useMemo } from 'react';

const COLORS = ['#fbbf24', '#f59e0b', '#10b981', '#38bdf8', '#f472b6', '#e2e8f0'];

export function Confetti({ count = 60 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        dx: `${Math.round((Math.random() - 0.5) * 160)}px`,
        size: 6 + Math.random() * 6,
        color: COLORS[i % COLORS.length],
        round: i % 3 === 0,
      })),
    [count],
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 animate-confetti"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * (p.round ? 1 : 0.5),
            background: p.color,
            borderRadius: p.round ? '9999px' : 2,
            animationDelay: `${p.delay}s`,
            ['--dx' as string]: p.dx,
          }}
        />
      ))}
    </div>
  );
}
