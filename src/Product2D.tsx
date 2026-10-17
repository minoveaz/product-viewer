import { useId } from 'react';
import type { Layer, ProductSource } from './types';

interface Product2DProps {
  source: ProductSource;
  layers: Layer[];
  className?: string;
  label?: string;
}

/** SVG path of the outline with the hole cut out (even-odd), used to clip the front photo. */
function silhouettePath(source: ProductSource): string {
  const [first, ...rest] = source.outline;
  let d = `M${first.x} ${first.y}` + rest.map((p) => ` L${p.x} ${p.y}`).join('') + ' Z';
  if (source.hole) {
    const { x, y, r } = source.hole;
    d += ` M${x + r} ${y} A${r} ${r} 0 1 0 ${x - r} ${y} A${r} ${r} 0 1 0 ${x + r} ${y} Z`;
  }
  return d;
}

export function Product2D({ source, layers, className, label = 'Vista previa del producto' }: Product2DProps) {
  const clipId = `silhouette-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 1 1" role="img" aria-label={label} className={className}>
      <defs>
        <clipPath id={clipId}>
          <path d={silhouettePath(source)} clipRule="evenodd" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <image href={source.baseImage} x={0} y={0} width={1} height={1} preserveAspectRatio="xMidYMid meet" />
      </g>
      {layers.map((layer) =>
        layer.type === 'image' ? (
          <image
            key={layer.id}
            href={layer.src}
            x={layer.x}
            y={layer.y}
            width={layer.width}
            height={layer.height}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : layer.text.trim() ? (
          <text
            key={layer.id}
            x={layer.x}
            y={layer.y}
            fontSize={layer.fontSize}
            fontFamily={layer.fontFamily}
            fontWeight={layer.fontWeight ?? 'normal'}
            fontStyle={layer.fontStyle ?? 'normal'}
            fill={layer.color}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {layer.text}
          </text>
        ) : null,
      )}
    </svg>
  );
}
