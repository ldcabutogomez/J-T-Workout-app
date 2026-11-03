import { BatteryFull, Church, Crown, Drumstick, Flame, Flower2, Leaf, Snowflake, Sparkles, Sun, TreePine, Trophy, type LucideIcon } from 'lucide-react';
import type { AvatarColor, UserProfile } from '../types';
import { flairById, type FlairIconKey } from '../lib/perks';
import { avatarInitial, defaultAvatarColor } from '../lib/avatar';

// Literal class names so Tailwind can see them. Every pair is checked in tests/theme.test.ts.
export const AVATAR_TILE: Record<AvatarColor, string> = {
  accent: 'bg-accent text-on-accent',
  violet: 'bg-violet text-on-accent',
  cobalt: 'bg-cobalt text-on-accent',
  ok: 'bg-ok text-on-accent',
  gold: 'bg-gold-ink text-on-accent',
  ink: 'bg-ink text-paper',
  clay: 'bg-clay text-on-accent',
  teal: 'bg-teal text-on-accent',
};

const FLAIR_ICONS: Record<FlairIconKey, LucideIcon> = { sparkles: Sparkles, flame: Flame, church: Church, crown: Crown, trophy: Trophy, snowflake: Snowflake, flower: Flower2, sun: Sun, leaf: Leaf, drumstick: Drumstick, tree: TreePine, battery: BatteryFull };

interface AvatarProps {
  profile: Pick<UserProfile, 'id' | 'name' | 'avatar' | 'colorTheme'> & { flair?: string };
  size?: number;
  /** Set when the name is shown next to the avatar, so assistive tech does not read it twice. */
  decorative?: boolean;
}

function AvatarBase({ profile, size = 32, decorative = false }: AvatarProps) {
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
  const color = profile.avatar?.color ?? defaultAvatarColor(profile);
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

/** The avatar, with the equipped flair as a small badge on its corner. */
export function Avatar(props: AvatarProps) {
  const flair = flairById(props.profile.flair);
  if (!flair) return <AvatarBase {...props} />;
  const Icon = FLAIR_ICONS[flair.icon];
  const size = props.size ?? 32;
  const badge = Math.max(14, Math.round(size * 0.42));
  return (
    <span className="relative inline-flex shrink-0">
      <AvatarBase {...props} />
      <span
        role={props.decorative ? undefined : 'img'}
        aria-label={props.decorative ? undefined : flair.label}
        aria-hidden={props.decorative || undefined}
        style={{ width: badge, height: badge }}
        className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full border-2 border-surface bg-gold-ink text-on-accent"
      >
        <Icon style={{ width: badge * 0.6, height: badge * 0.6 }} strokeWidth={2.5} />
      </span>
    </span>
  );
}
