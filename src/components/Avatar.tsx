import type { AvatarColor, UserProfile } from '../types';
import { avatarInitial, defaultAvatarColor } from '../lib/avatar';

// Literal class names so Tailwind can see them. Every pair is checked in tests/theme.test.ts.
export const AVATAR_TILE: Record<AvatarColor, string> = {
  accent: 'bg-accent text-on-accent',
  ok: 'bg-ok text-on-accent',
  gold: 'bg-gold-ink text-on-accent',
  ink: 'bg-ink text-paper',
  clay: 'bg-clay text-on-accent',
  teal: 'bg-teal text-on-accent',
};

interface AvatarProps {
  profile: Pick<UserProfile, 'id' | 'name' | 'avatar'>;
  size?: number;
  /** Set when the name is shown next to the avatar, so assistive tech does not read it twice. */
  decorative?: boolean;
}

export function Avatar({ profile, size = 32, decorative = false }: AvatarProps) {
  const style = { width: size, height: size };
  if (profile.avatar?.photo) {
    return (
      <img
        src={profile.avatar.photo}
        alt={decorative ? '' : `${profile.name}'s profile photo`}
        style={style}
        className="shrink-0 rounded-full border border-line object-cover"
      />
    );
  }
  const color = profile.avatar?.color ?? defaultAvatarColor(profile.id);
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : `${profile.name}'s profile picture`}
      aria-hidden={decorative || undefined}
      style={{ ...style, fontSize: size * 0.5 }}
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold leading-none ${AVATAR_TILE[color]}`}
    >
      {avatarInitial(profile.name)}
    </span>
  );
}
