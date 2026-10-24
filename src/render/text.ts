export const FONT = '"Press Start 2P", "Courier New", monospace';

export interface TextOpts {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  shadow?: string | false;
}

export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextOpts = {}): void {
  const size = o.size ?? 8;
  g.font = `${size}px ${FONT}`;
  g.textAlign = o.align ?? 'left';
  g.textBaseline = o.baseline ?? 'top';
  const rx = Math.round(x);
  const ry = Math.round(y);
  if (o.shadow !== false) {
    g.fillStyle = o.shadow ?? 'rgba(0,0,0,0.75)';
    g.fillText(s, rx + 1, ry + 1);
  }
  g.fillStyle = o.color ?? '#ffffff';
  g.fillText(s, rx, ry);
}

export function textWidth(g: CanvasRenderingContext2D, s: string, size = 8): number {
  g.font = `${size}px ${FONT}`;
  return g.measureText(s).width;
}
