import type { AvatarColor, ProfileAvatar } from '../types';

export const AVATAR_COLORS: readonly AvatarColor[] = ['accent', 'ok', 'gold', 'ink', 'clay', 'teal'];
export const AVATAR_PHOTO_PREFIX = 'data:image/jpeg;base64,';
/** About 60 KB of image data once base64-encoded. */
export const AVATAR_PHOTO_MAX_CHARS = 80_000;
export const AVATAR_PHOTO_SIZE = 160;

/** Largest centered square inside a width x height image. */
export function squareCrop(width: number, height: number): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height);
  return { sx: Math.floor((width - size) / 2), sy: Math.floor((height - size) / 2), size };
}

/** Stable default tile color, so a profile keeps the same color without any saved choice. */
export function defaultAvatarColor(profileId: string): AvatarColor {
  let hash = 0;
  for (const char of profileId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function avatarInitial(name: string): string {
  const letter = Array.from(name.trim())[0];
  return letter ? letter.toUpperCase() : '?';
}

export function isValidAvatar(value: unknown): value is ProfileAvatar {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { photo, color } = value as Record<string, unknown>;
  const photoOk = photo === undefined
    || (typeof photo === 'string' && photo.startsWith(AVATAR_PHOTO_PREFIX) && photo.length <= AVATAR_PHOTO_MAX_CHARS);
  const colorOk = color === undefined || (typeof color === 'string' && (AVATAR_COLORS as readonly string[]).includes(color));
  return photoOk && colorOk;
}

/** Decodes a picked image, center-crops it square, and returns a small JPEG data URL. */
export async function fileToAvatarPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 25_000_000) throw new Error('That image is too large. Choose one under 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error('That image could not be read. Try a JPEG or PNG.');
    }
    const { sx, sy, size } = squareCrop(image.naturalWidth, image.naturalHeight);
    if (size <= 0) throw new Error('That image could not be read. Try a JPEG or PNG.');
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_PHOTO_SIZE;
    canvas.height = AVATAR_PHOTO_SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot process images.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, AVATAR_PHOTO_SIZE, AVATAR_PHOTO_SIZE);
    context.drawImage(image, sx, sy, size, size, 0, 0, AVATAR_PHOTO_SIZE, AVATAR_PHOTO_SIZE);
    for (const quality of [0.82, 0.65, 0.5]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= AVATAR_PHOTO_MAX_CHARS) return dataUrl;
    }
    throw new Error('That image is too detailed to store. Try another photo.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
