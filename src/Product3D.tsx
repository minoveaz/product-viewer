import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { composeArtwork, composeEngravingMask } from './compose';
import type { Layer, Point, ProductSource } from './types';

export type Model3D = { kind: 'extrude' } | { kind: 'glb'; url: string };

interface Product3DProps {
  source: ProductSource;
  layers: Layer[];
  model?: Model3D;
  className?: string;
  label?: string;
}

const SIDE = '#e3c27c';

/** One scene unit = 16 mm, so the tag stays in a comfortable range for the camera. */
const MM_PER_UNIT = 16;

interface Frame {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function frameOf(outline: Point[]): Frame {
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Real size of the object in scene units, taken from the source's millimetres. */
function sizeOf(source: ProductSource) {
  const frame = frameOf(source.outline);
  const width = source.widthMm / MM_PER_UNIT;
  const aspect = (frame.maxY - frame.minY) / (frame.maxX - frame.minX);
  const height = (source.heightMm ? source.heightMm / MM_PER_UNIT : width * aspect);
  return { width, height, thickness: source.thicknessMm / MM_PER_UNIT, frame };
}

function StudioEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      environment.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

/** Builds the real object: outline with its ring hole, extruded to the true thickness with a rounded edge. */
function buildGeometry(source: ProductSource): THREE.ExtrudeGeometry {
  const { width, height, thickness, frame } = sizeOf(source);
  const bevel = thickness * 0.4;
  const sx = (width - 2 * bevel) / width;
  const sy = (height - 2 * bevel) / height;
  const bw = frame.maxX - frame.minX;
  const bh = frame.maxY - frame.minY;
  const cx = (frame.minX + frame.maxX) / 2;
  const cy = (frame.minY + frame.maxY) / 2;
  const toScene = (u: number, v: number): [number, number] => [
    ((u - cx) / bw) * width * sx,
    (-(v - cy) / bh) * height * sy,
  ];

  const shape = new THREE.Shape();
  const points = source.outline.map((p) => new THREE.Vector2(...toScene(p.x, p.y)));
  shape.moveTo(points[0].x, points[0].y);
  shape.splineThru([...points.slice(1), points[0]]);
  shape.closePath();

  if (source.hole) {
    const [hx, hy] = toScene(source.hole.x, source.hole.y);
    const hr = (source.hole.r / bw) * width * sx;
    const hole = new THREE.Path();
    hole.absarc(hx, hy, hr, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }

  const depth = Math.max(thickness - 2 * bevel, thickness * 0.1);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 8,
    curveSegments: 40,
  });
  geo.translate(0, 0, -depth / 2);

  // Map each cap vertex back to the front image so the artwork lines up with the outline.
  const position = geo.attributes.position;
  const normal = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const u = (x / (width * sx)) * bw + cx;
    const v = -(y / (height * sy)) * bh + cy;
    const isBack = normal.getZ(i) < -0.5;
    uv.setXY(i, isBack ? 1 - u : u, 1 - v);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Front and back caps show the artwork; the rounded edge stays metal. */
function ExtrudedObject({ source, layers }: { source: ProductSource; layers: Layer[] }) {
  const geometry = useMemo(() => buildGeometry(source), [source]);
  const layersKey = JSON.stringify(layers);
  const [textures, setTextures] = useState<{ color: THREE.CanvasTexture; relief: THREE.CanvasTexture } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: { color: THREE.CanvasTexture; relief: THREE.CanvasTexture } | null = null;
    composeArtwork(source, layers).then((canvas) => {
      if (cancelled) return;
      const color = new THREE.CanvasTexture(canvas);
      color.colorSpace = THREE.SRGBColorSpace;
      color.anisotropy = 8;
      const relief = new THREE.CanvasTexture(composeEngravingMask(layers));
      relief.anisotropy = 8;
      created = { color, relief };
      setTextures(created);
    });
    return () => {
      cancelled = true;
      created?.color.dispose();
      created?.relief.dispose();
    };
    // layersKey stands in for `layers` so inline arrays do not retrigger composition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, layersKey]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        key={textures?.color.uuid ?? 'no-texture'}
        attach="material-0"
        map={textures?.color ?? null}
        bumpMap={textures?.relief ?? null}
        bumpScale={2}
        metalness={0.05}
        roughness={0.62}
      />
      <meshStandardMaterial attach="material-1" color={SIDE} metalness={0.2} roughness={0.5} />
    </mesh>
  );
}

function GlbObject({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const copy = useMemo(() => scene.clone(), [scene]);
  return <primitive object={copy} />;
}

/** Places the camera so the whole object, its shadow and a margin fit the canvas in both directions. */
function FitCamera({ width, height }: { width: number; height: number }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);

  useEffect(() => {
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const aspect = size.width / size.height;
    const halfHeight = (height / 2 + width * 0.12) * 1.2;
    const halfWidth = (width / 2) * 1.3;
    const distance = Math.max(halfHeight / Math.tan(halfFov), halfWidth / (Math.tan(halfFov) * aspect));
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size, width, height]);

  return null;
}

export function Product3D({ source, layers, model = { kind: 'extrude' }, className, label = 'Vista 3D del producto' }: Product3DProps) {
  const { width, height } = sizeOf(source);
  return (
    <div role="img" aria-label={label} className={className}>
      <Canvas
        camera={{ fov: 30, near: 0.1, far: width * 40 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.NoToneMapping }}
      >
        <FitCamera width={width} height={height} />
        <StudioEnvironment />
        <ambientLight intensity={0.55} />
        <directionalLight position={[-width, height * 2, width * 2]} intensity={0.9} />
        {model.kind === 'glb' ? <GlbObject url={model.url} /> : <ExtrudedObject source={source} layers={layers} />}
        <ContactShadows position={[0, -height / 2 - width * 0.12, 0]} opacity={0.3} scale={width * 3} blur={3} far={width * 2} />
        <OrbitControls enablePan={false} minDistance={width * 1.5} maxDistance={width * 6} />
      </Canvas>
    </div>
  );
}
