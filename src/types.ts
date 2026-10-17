// All coordinates are normalized to 0..1 over the base image (0,0 = top-left).

export interface Point {
  x: number;
  y: number;
}

export interface ImageLayer {
  id: string;
  type: 'image';
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextLayer {
  id: string;
  type: 'text';
  text: string;
  x: number;
  y: number;
  /** Font size as a fraction of the base image height. */
  fontSize: number;
  fontFamily: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  color: string;
}

export type Layer = ImageLayer | TextLayer;

export type ProductFace = 'front' | 'back';

export interface ProductSource {
  /** Square front artwork of the object (e.g. the product photo on white). */
  baseImage: string;
  /**
   * Closed outline of the physical object, normalized to the base image.
   * Used to clip the 2D artwork and to build the 3D extrusion.
   */
  outline: Point[];
  /** Optional hole (e.g. the ring hole), normalized to the base image width. */
  hole?: { x: number; y: number; r: number };
  /** Real width in millimetres. */
  widthMm: number;
  /** Real height in millimetres. Defaults to the outline's aspect ratio. */
  heightMm?: number;
  /** Real thickness in millimetres. */
  thicknessMm: number;
  /** Optional color for the extruded edge material. */
  sideColor?: string;
}

export type ViewMode = '2d' | '3d';
