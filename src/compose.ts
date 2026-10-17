import type { Layer, ProductSource, TextLayer } from './types';

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    image.src = src;
  });

/** Draws the front artwork clipped to the object outline (minus the hole), then every layer on top. */
export async function composeArtwork(source: ProductSource, layers: Layer[], size = 1024): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');

  const base = await loadImage(source.baseImage);
  const layerImages = await Promise.all(
    layers.map((layer) => (layer.type === 'image' ? loadImage(layer.src) : Promise.resolve(null))),
  );

  ctx.save();
  ctx.beginPath();
  source.outline.forEach((point, index) => {
    const px = point.x * size;
    const py = point.y * size;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  if (source.hole) {
    ctx.moveTo((source.hole.x + source.hole.r) * size, source.hole.y * size);
    ctx.arc(source.hole.x * size, source.hole.y * size, source.hole.r * size, 0, Math.PI * 2);
  }
  ctx.clip('evenodd');
  ctx.drawImage(base, 0, 0, size, size);
  ctx.restore();

  layers.forEach((layer, index) => {
    if (layer.type === 'image') {
      const image = layerImages[index];
      if (image) ctx.drawImage(image, layer.x * size, layer.y * size, layer.width * size, layer.height * size);
      return;
    }
    drawText(ctx, layer, size, layer.color);
  });

  return canvas;
}

/** Grayscale relief map: engraved layers are white, everything else black. */
export function composeEngravingMask(layers: Layer[], size = 1024): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  layers.forEach((layer) => {
    if (layer.type === 'text' && layer.text.trim()) drawText(ctx, layer, size, '#fff');
  });
  return canvas;
}

function drawText(ctx: CanvasRenderingContext2D, layer: TextLayer, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.font = `${layer.fontStyle ?? 'normal'} ${layer.fontWeight ?? 'normal'} ${layer.fontSize * size}px ${layer.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(layer.text, layer.x * size, layer.y * size);
}
