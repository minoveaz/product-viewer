import { lazy, Suspense, type ReactNode } from 'react';
import { Product2D } from './Product2D';
import type { Model3D } from './Product3D';
import type { Layer, ProductSource, ViewMode } from './types';

const Product3D = lazy(() => import('./Product3D').then((module) => ({ default: module.Product3D })));

export interface ProductViewerProps {
  view: ViewMode;
  source: ProductSource;
  layers: Layer[];
  model?: Model3D;
  className?: string;
  label?: string;
  /** Shown while the 3D engine loads. */
  fallback?: ReactNode;
}

/** Renders the product in 2D or 3D from the same source and layers. The 3D engine is loaded lazily. */
export function ProductViewer({ view, source, layers, model, className, label, fallback }: ProductViewerProps) {
  if (view === '2d') {
    return <Product2D source={source} layers={layers} className={className} label={label} />;
  }
  return (
    <Suspense fallback={fallback ?? <Product2D source={source} layers={layers} className={className} label={label} />}>
      <Product3D source={source} layers={layers} model={model} className={className} label={label} />
    </Suspense>
  );
}

export interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  className?: string;
  buttonClassName?: string;
  activeClassName?: string;
  labels?: Record<ViewMode, string>;
}

export function ViewToggle({
  value,
  onChange,
  className,
  buttonClassName,
  activeClassName,
  labels = { '2d': '2D', '3d': '3D' },
}: ViewToggleProps) {
  return (
    <div role="group" aria-label="Modo de vista" className={className}>
      {(['2d', '3d'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
          className={`${buttonClassName ?? ''} ${value === mode ? activeClassName ?? '' : ''}`.trim()}
        >
          {labels[mode]}
        </button>
      ))}
    </div>
  );
}
