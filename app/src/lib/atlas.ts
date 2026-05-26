// Sprite-atlas loader. Each atlas is a .webp packed image + .json frame map
// of the form { frames: { "<state>:<path>": { frame:{x,y,w,h} } }, meta:{scale} }.

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AtlasJson {
  frames: Record<string, { frame: Frame }>;
  meta: { image: string; scale: string; size: { w: number; h: number } };
}

export class Atlas {
  img!: HTMLImageElement;
  frames: Record<string, Frame> = {};
  scale = 0.5; // packed-image scale; display size = frame / scale

  async load(name: string): Promise<this> {
    const base = import.meta.env.BASE_URL; // "/" in dev, "/<repo>/" on GitHub Pages
    const json: AtlasJson = await fetch(`${base}assets/${name}.json`).then((r) => r.json());
    this.scale = parseFloat(json.meta.scale) || 0.5;
    for (const [k, v] of Object.entries(json.frames)) this.frames[k] = v.frame;
    this.img = await loadImage(`${base}assets/${json.meta.image}`);
    return this;
  }

  has(key: string): boolean {
    return key in this.frames;
  }

  /** Draw a frame centered at world (cx,cy), sized in world units. `size`
   *  overrides the natural size (frame / scale) when provided. */
  drawCentered(
    ctx: CanvasRenderingContext2D,
    key: string,
    cx: number,
    cy: number,
    size?: number,
    alpha = 1
  ): number {
    const f = this.frames[key];
    if (!f) return 0;
    const natW = f.w / this.scale;
    const natH = f.h / this.scale;
    const ratio = size ? size / Math.max(natW, natH) : 1;
    const w = natW * ratio;
    const h = natH * ratio;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(this.img, f.x, f.y, f.w, f.h, cx - w / 2, cy - h / 2, w, h);
    if (alpha !== 1) ctx.globalAlpha = 1;
    return Math.max(w, h);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface AtlasSet {
  skills: Atlas;
  skillsDisabled: Atlas;
  frame: Atlas;
  mastery: Atlas;
}

export async function loadAtlases(): Promise<AtlasSet> {
  const [skills, skillsDisabled, frame, mastery] = await Promise.all([
    new Atlas().load("skills"),
    new Atlas().load("skills-disabled"),
    new Atlas().load("frame"),
    new Atlas().load("mastery-effect-active"),
  ]);
  return { skills, skillsDisabled, frame, mastery };
}
