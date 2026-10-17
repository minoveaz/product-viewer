# @minoveaz/product-viewer

Visor reutilizable de producto en **2D y 3D** para ecommerce. Muestra la foto frontal de un objeto físico, le aplica capas de texto o imagen (por ejemplo, un nombre grabado) y permite girar la versión 3D.

No genera modelos desde imagen o texto: solo previsualiza y personaliza un objeto que ya existe.

## Instalación

```bash
npm install github:minoveaz/product-viewer#v0.1.0
```

Requiere como peer dependencies: `react`, `react-dom`, `three`, `@react-three/fiber` y `@react-three/drei`.

## Uso

```tsx
import { useState } from 'react';
import { ProductViewer, ViewToggle, type Layer, type ViewMode } from '@minoveaz/product-viewer';

const source = {
  baseImage: '/images/tag-front.png',
  outline: [{ x: 0.5, y: 0.2 }, { x: 0.8, y: 0.5 }, { x: 0.5, y: 0.9 }, { x: 0.2, y: 0.5 }],
  hole: { x: 0.5, y: 0.35, r: 0.04 },
  widthMm: 35,
  heightMm: 32,
  thicknessMm: 2.5,
};

const layers: Layer[] = [
  { id: 'name', type: 'text', text: 'Amber', x: 0.5, y: 0.6, fontSize: 0.1, fontFamily: 'Georgia, serif', color: '#8a6b2e' },
];

function Preview() {
  const [view, setView] = useState<ViewMode>('2d');
  return (
    <>
      <ViewToggle value={view} onChange={setView} />
      <ProductViewer view={view} source={source} layers={layers} className="h-96 w-full" />
    </>
  );
}
```

El motor 3D se carga de forma diferida: solo se descarga cuando se muestra la vista `3d`.

## Contrato

### `ProductSource`

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `baseImage` | `string` | Imagen frontal del objeto. |
| `outline` | `Point[]` | Contorno cerrado, normalizado 0–1 sobre la imagen. |
| `hole` | `{ x, y, r }` (opcional) | Agujero (p. ej. anilla), normalizado. `r` respecto al ancho. |
| `widthMm` | `number` | Ancho real en milímetros. |
| `heightMm` | `number` (opcional) | Alto real. Si falta, se deduce de la proporción del contorno. |
| `thicknessMm` | `number` | Grosor real en milímetros. |

### `Layer`

- `TextLayer`: `text`, `x`, `y`, `fontSize` (fracción de la altura), `fontFamily`, `fontWeight?`, `fontStyle?`, `color`.
- `ImageLayer`: `src`, `x`, `y`, `width`, `height` (fracciones de la imagen).

### Componentes y funciones

- `ProductViewer` — `view: '2d' | '3d'`, `source`, `layers`, `model?`, `className?`, `label?`, `fallback?`.
- `Product2D` — solo vista plana SVG.
- `ViewToggle` — selector 2D/3D accesible (`aria-pressed`).
- `composeArtwork(source, layers)` — genera el canvas de la cara frontal.

## Desarrollo

```bash
npm install
npm run typecheck
npm run build
```

`npm run build` se ejecuta también al instalar desde git (`prepare`), así que no hace falta commitear `dist/`.

## Versionado

Semver. Cada cambio de contrato (`ProductSource`, `Layer`) es un cambio mayor. Las tiendas deben fijar la versión con un tag, por ejemplo `#v0.1.0`.
