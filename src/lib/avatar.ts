import type { AvatarColor, ColorTheme, ProfileAvatar } from '../types';
import { themeForProfile } from './theme';

export const AVATAR_COLORS: readonly AvatarColor[] = ['accent', 'violet', 'cobalt', 'ok', 'gold', 'ink', 'clay', 'teal'];
export const AVATAR_PHOTO_PREFIX = 'data:image/jpeg;base64,';
/** About 60 KB of image data once base64-encoded. */
export const AVATAR_PHOTO_MAX_CHARS = 80_000;
export const AVATAR_PHOTO_SIZE = 160;
/** The thumbnail a partner receives: small enough to ride inside the 8 KB sync snapshot. */
export const AVATAR_THUMB_SIZE = 64;
export const AVATAR_THUMB_MAX_CHARS = 5_500;

/** True for a JPEG data URL whose payload is plain base64 and no longer than `maxChars`. Used on untrusted partner data too. */
export function isJpegDataUrl(value: unknown, maxChars: number): value is string {
  return typeof value === 'string'
    && value.length <= maxChars
    && value.startsWith(AVATAR_PHOTO_PREFIX)
    && /^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(AVATAR_PHOTO_PREFIX.length));
}

/** Largest centered square inside a width x height image. */
export function squareCrop(width: number, height: number): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height);
  return { sx: Math.floor((width - size) / 2), sy: Math.floor((height - size) / 2), size };
}

const THEME_AVATAR: Record<ColorTheme, AvatarColor> = { lavender: 'violet', blue: 'cobalt', vermilion: 'accent', forest: 'teal', rose: 'clay' };

/** Default tile color follows the profile's theme, so the initial matches the person's look. */
export function defaultAvatarColor(profile: { id: string; colorTheme?: ColorTheme }): AvatarColor {
  return THEME_AVATAR[themeForProfile(profile)];
}

export function avatarInitial(name: string): string {
  const letter = Array.from(name.trim())[0];
  return letter ? letter.toUpperCase() : '?';
}

export function isValidAvatar(value: unknown): value is ProfileAvatar {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { photo, thumb, color } = value as Record<string, unknown>;
  const photoOk = photo === undefined
    || (typeof photo === 'string' && photo.startsWith(AVATAR_PHOTO_PREFIX) && photo.length <= AVATAR_PHOTO_MAX_CHARS);
  const thumbOk = thumb === undefined || isJpegDataUrl(thumb, AVATAR_THUMB_MAX_CHARS);
  const colorOk = color === undefined || (typeof color === 'string' && (AVATAR_COLORS as readonly string[]).includes(color));
  return photoOk && thumbOk && colorOk;
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

/** Shrinks any avatar data URL to the partner thumbnail. Returns null if it cannot be made small enough. */
export async function makeAvatarThumb(source: string): Promise<string | null> {
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const { sx, sy, size } = squareCrop(image.naturalWidth, image.naturalHeight);
    if (size <= 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_THUMB_SIZE;
    canvas.height = AVATAR_THUMB_SIZE;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, AVATAR_THUMB_SIZE, AVATAR_THUMB_SIZE);
    context.drawImage(image, sx, sy, size, size, 0, 0, AVATAR_THUMB_SIZE, AVATAR_THUMB_SIZE);
    for (const quality of [0.6, 0.5, 0.4, 0.3]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (isJpegDataUrl(dataUrl, AVATAR_THUMB_MAX_CHARS)) return dataUrl;
    }
  } catch {
    // A thumbnail is optional; without one the partner sees your colored initial.
  }
  return null;
}

/** A chosen photo plus the thumbnail made from it. */
export async function fileToAvatar(file: File): Promise<{ photo: string; thumb?: string }> {
  const photo = await fileToAvatarPhoto(file);
  const thumb = await makeAvatarThumb(photo);
  return thumb ? { photo, thumb } : { photo };
}
