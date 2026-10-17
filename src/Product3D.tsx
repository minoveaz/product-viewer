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
  layers?: Layer[];
  frontLayers?: Layer[];
  backLayers?: Layer[];
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
  const [caps, sides] = geo.groups;
  geo.clearGroups();
  geo.addGroup(caps.start, caps.count / 2, 2);
  geo.addGroup(caps.start + caps.count / 2, caps.count / 2, 0);
  geo.addGroup(sides.start, sides.count, 1);
  return geo;
}

/** Front and back caps show the artwork; the rounded edge stays metal. */
function ExtrudedObject({
  source,
  frontLayers,
  backLayers,
}: {
  source: ProductSource;
  frontLayers: Layer[];
  backLayers: Layer[];
}) {
  const geometry = useMemo(() => buildGeometry(source), [source]);
  const layersKey = JSON.stringify([frontLayers, backLayers]);
  const [textures, setTextures] = useState<{
    front: THREE.CanvasTexture;
    back: THREE.CanvasTexture;
    frontRelief: THREE.CanvasTexture;
    backRelief: THREE.CanvasTexture;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: {
      front: THREE.CanvasTexture;
      back: THREE.CanvasTexture;
      frontRelief: THREE.CanvasTexture;
      backRelief: THREE.CanvasTexture;
    } | null = null;
    Promise.all([composeArtwork(source, frontLayers), composeArtwork(source, backLayers)]).then(([frontCanvas, backCanvas]) => {
      if (cancelled) return;
      const front = new THREE.CanvasTexture(frontCanvas);
      const back = new THREE.CanvasTexture(backCanvas);
      front.colorSpace = THREE.SRGBColorSpace;
      back.colorSpace = THREE.SRGBColorSpace;
      front.anisotropy = 8;
      back.anisotropy = 8;
      const frontRelief = new THREE.CanvasTexture(composeEngravingMask(frontLayers));
      const backRelief = new THREE.CanvasTexture(composeEngravingMask(backLayers));
      frontRelief.anisotropy = 8;
      backRelief.anisotropy = 8;
      created = { front, back, frontRelief, backRelief };
      setTextures(created);
    });
    return () => {
      cancelled = true;
      created?.front.dispose();
      created?.back.dispose();
      created?.frontRelief.dispose();
      created?.backRelief.dispose();
    };
    // layersKey stands in for the layer arrays so inline values do not retrigger composition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, layersKey]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        key={textures?.front.uuid ?? 'no-front-texture'}
        attach="material-0"
        map={textures?.front ?? null}
        bumpMap={textures?.frontRelief ?? null}
        bumpScale={2}
        metalness={0.05}
        roughness={0.62}
      />
      <meshStandardMaterial attach="material-1" color={source.sideColor ?? SIDE} metalness={0.2} roughness={0.5} />
      <meshStandardMaterial
        key={textures?.back.uuid ?? 'no-back-texture'}
        attach="material-2"
        map={textures?.back ?? null}
        bumpMap={textures?.backRelief ?? null}
        bumpScale={2}
        metalness={0.05}
        roughness={0.62}
      />
    </mesh>
  );
}

function GlbObject({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const copy = useMemo(() => scene.clone(), [scene]);
  return <primitive object={copy} />;
}

/** Frames the object's bounding sphere so it stays fully visible at any rotation, using the tighter of the two FOVs. */
function FitCamera({ radius }: { radius: number }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);

  useEffect(() => {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = size.width / size.height;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const fov = Math.min(vFov, hFov);
    const distance = (radius * 1.6) / Math.sin(fov / 2);
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.near = distance / 100;
    camera.far = distance * 4;
    camera.updateProjectionMatrix();
  }, [camera, size, radius]);

  return null;
}

export function Product3D({
  source,
  layers,
  frontLayers,
  backLayers,
  model = { kind: 'extrude' },
  className,
  label = 'Vista 3D del producto',
}: Product3DProps) {
  const { width, height, thickness } = sizeOf(source);
  const radius = Math.sqrt(width * width + height * height + thickness * thickness) / 2;
  const resolvedFrontLayers = frontLayers ?? layers ?? [];
  const resolvedBackLayers = backLayers ?? layers ?? [];
  return (
    <div role="img" aria-label={label} className={className}>
      <Canvas camera={{ fov: 30 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true, toneMapping: THREE.NoToneMapping }}>
        <FitCamera radius={radius} />
        <StudioEnvironment />
        <ambientLight intensity={0.55} />
        <directionalLight position={[-width, height * 2, width * 2]} intensity={0.9} />
        {model.kind === 'glb' ? (
          <GlbObject url={model.url} />
        ) : (
          <ExtrudedObject source={source} frontLayers={resolvedFrontLayers} backLayers={resolvedBackLayers} />
        )}
        <ContactShadows position={[0, -radius - width * 0.04, 0]} opacity={0.3} scale={radius * 3} blur={3} far={radius * 2} />
        <OrbitControls enablePan={false} minDistance={radius * 1.2} maxDistance={radius * 8} />
      </Canvas>
    </div>
  );
}
