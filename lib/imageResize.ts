/**
 * agently/lib/imageResize.ts   <-- NEW FILE
 * PATCH 24 — P2-1 client-side avatar downscaling.
 *
 * This is the deliberate alternative to adding `sharp` on the server.
 * Canvas resizing is free, instant, needs no dependency, adds nothing to the
 * Vercel bundle, and lets the user see exactly what will ship before saving.
 * The server still validates and normalises (lib/avatar-processor.js) — the
 * browser is a convenience, never the security boundary.
 */

export interface ResizedImage {
  dataUri: string;
  mimeType: string;
  byteLength: number;
  width: number;
  height: number;
}

const DEFAULT_MAX_DIMENSION = 128;
const DEFAULT_MAX_BYTES = 96 * 1024;

function base64Bytes(dataUri: string) {
  const b64 = dataUri.split(',')[1] || '';
  return Math.floor((b64.length * 3) / 4);
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a readable image.'));
    img.src = src;
  });
}

/**
 * Square-crops to centre, downscales, and steps quality down until the result
 * fits the byte budget. Square because the widget renders a circular avatar —
 * cropping here means the deployed bubble matches the preview exactly.
 */
export async function resizeAvatar(
  file: File,
  {
    maxDimension = DEFAULT_MAX_DIMENSION,
    maxBytes = DEFAULT_MAX_BYTES,
  }: { maxDimension?: number; maxBytes?: number } = {},
): Promise<ResizedImage> {
  // SVG is vector: rasterising would make it worse. Pass through, size-checked.
  if (file.type === 'image/svg+xml') {
    const dataUri = await readFile(file);
    const byteLength = base64Bytes(dataUri);
    if (byteLength > maxBytes) {
      throw new Error(
        `That SVG is ${Math.round(byteLength / 1024)}KB. Please use one under ${Math.round(maxBytes / 1024)}KB.`,
      );
    }
    return { dataUri, mimeType: 'image/svg+xml', byteLength, width: 0, height: 0 };
  }

  const source = await readFile(file);
  const img = await loadImage(source);

  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  const target = Math.min(maxDimension, side);

  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process that image.');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);

  // Transparency must survive, so PNG first. If PNG is too heavy for a photo,
  // fall back to progressively lower-quality WebP then JPEG.
  const hasAlpha = /png|webp|gif/i.test(file.type);
  const attempts: Array<[string, number | undefined]> = hasAlpha
    ? [['image/png', undefined], ['image/webp', 0.9], ['image/webp', 0.75], ['image/webp', 0.6]]
    : [['image/webp', 0.85], ['image/webp', 0.7], ['image/jpeg', 0.8], ['image/jpeg', 0.6]];

  for (const [mime, quality] of attempts) {
    const dataUri = canvas.toDataURL(mime, quality);
    // toDataURL silently falls back to PNG for unsupported types.
    if (!dataUri.startsWith(`data:${mime}`)) continue;
    const byteLength = base64Bytes(dataUri);
    if (byteLength <= maxBytes) {
      return { dataUri, mimeType: mime, byteLength, width: target, height: target };
    }
  }

  // Last resort: halve the dimension and retry once.
  if (target > 64) {
    return resizeAvatar(file, { maxDimension: Math.floor(target / 2), maxBytes });
  }

  throw new Error(
    `We couldn't compress that image below ${Math.round(maxBytes / 1024)}KB. Please try a simpler image, like a logo on a plain background.`,
  );
}

export default resizeAvatar;
