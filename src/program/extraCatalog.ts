import { EXERCISES } from './swapOptions';
import { slug } from '../lib/slug';

/** Common accessory work to suggest when adding an exercise a la carte. Anything can still be typed in. */
const EXTRA_SUGGESTIONS = [
  'Hip Abduction', 'Hip Adduction', 'Glute Kickback', 'Leg Curl', 'Leg Extension', 'Leg Press', 'Hack Squat',
  'Standing Calf Raise', 'Seated Calf Raise', 'Back Extension', 'Cable Crunch', 'Hanging Leg Raise', 'Ab Wheel',
  'Biceps Curl', 'Hammer Curl', 'Preacher Curl', 'Triceps Pushdown', 'Skull Crushers', 'Overhead Triceps Extension',
  'Lateral Raise', 'Rear Delt Fly', 'Face Pull', 'Shrugs', 'Lat Pulldown', 'Seated Cable Row', 'Chest Fly',
  'Farmer Carry', 'Sled Push',
];

export interface KnownExercise {
  id: string;
  name: string;
}

/** Every exercise the app can suggest for an added exercise: its own catalog plus the common accessories, A to Z, no repeats. */
export function knownExercises(): KnownExercise[] {
  const byId = new Map<string, string>();
  for (const [id, info] of Object.entries(EXERCISES)) byId.set(id, info.name);
  for (const name of EXTRA_SUGGESTIONS) if (!byId.has(slug(name))) byId.set(slug(name), name);
  return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
