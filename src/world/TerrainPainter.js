/**
 * Paints a World into an RGBA pixel buffer. Pure JavaScript: no Phaser and no
 * DOM, so it can be tested and reused (the renderer uploads the buffer once).
 *
 * Look
 *  - Each tile has a base colour from its terrain/biome, refined by moisture,
 *    temperature and elevation. Colours are blended bilinearly between tile
 *    centres, so biome borders fade instead of showing a square grid.
 *  - Water and land are blended separately and the coastline is the zero
 *    crossing of a smooth field, giving organic (not blocky) shores.
 *  - Hill shading (light from the north-west) makes mountain ranges and
 *    valleys readable; forests get a canopy texture.
 *  - Rivers are soft anti-aliased lines from tile centre to tile centre,
 *    widening with flow.
 *
 * `scale` is texels per tile: 1 for the zoomed-out overview, 3-6 for detail.
 */
import { hash2D } from '../utils/Noise.js';
import { BIOME } from './biomes.js';
import { TERRAIN } from './terrain.js';
import { DIR_DX, DIR_DY } from './grid.js';
import { HILL_LEVEL, MOUNTAIN_LEVEL, SEA_LEVEL, SHALLOW_LEVEL } from './worldConstants.js';

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const RIVER_COLOR = [70, 140, 184];
const ROCK = [122, 114, 106];
const ROCK_LIGHT = [166, 158, 150];

/** Base colour per biome (used for land, and tinted into hills). */
const BIOME_COLOR = {
  [BIOME.ICE]: [236, 240, 244],
  [BIOME.TUNDRA]: [150, 160, 132],
  [BIOME.TAIGA]: [48, 88, 70],
  [BIOME.GRASSLAND]: [118, 152, 82],
  [BIOME.TEMPERATE_FOREST]: [62, 104, 54],
  [BIOME.RAINFOREST]: [26, 84, 46],
  [BIOME.SAVANNA]: [170, 164, 92],
  [BIOME.DESERT]: [216, 188, 124],
  [BIOME.SWAMP]: [78, 104, 76],
  [BIOME.ALPINE]: ROCK,
};

/** Per-terrain grain (texture) amplitude and how strongly hill shading applies. */
const GRAIN = [0.02, 0.02, 0.04, 0.05, 0.07, 0.1, 0.04, 0.16, 0.22, 0.05, 0.06, 0.03, 0.1, 0.02];
const SHADE_STRENGTH = [0, 0, 0.35, 0.5, 0.8, 0.9, 0.45, 0.6, 0.6, 0.55, 0.6, 0.7, 0.3, 0];

function mix3(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

/** Colour of one tile (before shading and grain). */
function tileColor(world, i) {
  const terrain = world.tiles[i];
  const e = world.elevation[i];
  const m = world.moisture[i] / 255;
  const biome = world.biomes[i];

  switch (terrain) {
    case TERRAIN.DEEP_WATER:
      return mix3([22, 62, 98], [8, 28, 58], clamp01((SHALLOW_LEVEL - e) / 0.3));
    case TERRAIN.SHALLOW_WATER:
      return mix3([66, 150, 164], [38, 108, 142], clamp01((SEA_LEVEL - e) / (SEA_LEVEL - SHALLOW_LEVEL)));
    case TERRAIN.LAKE:
      return [62, 126, 158];
    case TERRAIN.SAND:
      return mix3([218, 202, 156], [200, 184, 138], m);
    case TERRAIN.PLAINS:
      return mix3([178, 172, 100], [140, 162, 88], m);
    case TERRAIN.GRASS:
      return mix3([132, 158, 84], [86, 144, 74], m);
    case TERRAIN.FOREST:
      return biome === BIOME.TAIGA ? [50, 90, 70] : mix3([74, 112, 58], [54, 98, 52], m);
    case TERRAIN.DENSE_FOREST:
      return biome === BIOME.TAIGA ? [34, 70, 60] : biome === BIOME.RAINFOREST ? [22, 80, 44] : [38, 82, 46];
    case TERRAIN.DESERT:
      return mix3([220, 192, 128], [206, 176, 112], m);
    case TERRAIN.TUNDRA:
      return mix3([150, 160, 132], [132, 146, 126], m);
    case TERRAIN.SNOW:
      return [238, 242, 246];
    case TERRAIN.SWAMP:
      return [78, 104, 76];
    case TERRAIN.HILLS: {
      const base = BIOME_COLOR[biome] ?? ROCK;
      return mix3(mix3(base, ROCK, 0.42), ROCK_LIGHT, clamp01((e - HILL_LEVEL) / 0.3) * 0.5);
    }
    case TERRAIN.MOUNTAIN:
      return mix3(ROCK, ROCK_LIGHT, clamp01((e - MOUNTAIN_LEVEL) / 0.26));
    default:
      return [255, 0, 255];
  }
}

/**
 * Hill shading per tile: light from the north-west. 0 = flat; positive =
 * lit slope, negative = shadow. Slopes are normalised by map size so a range
 * looks the same on small and large maps.
 */
function computeShade(world) {
  const { width: W, height: H, elevation } = world;
  const shade = new Float32Array(W * H);
  const k = 16 * (W / 256);
  for (let y = 0; y < H; y++) {
    const ym = Math.max(0, y - 1);
    const yp = Math.min(H - 1, y + 1);
    for (let x = 0; x < W; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(W - 1, x + 1);
      const dx = (elevation[y * W + xp] - elevation[y * W + xm]) * 0.5;
      const dy = (elevation[yp * W + x] - elevation[ym * W + x]) * 0.5;
      shade[y * W + x] = Math.max(-0.4, Math.min(0.4, (dx + dy) * k * -1));
    }
  }
  return shade;
}

/** Soft capsule: blend `color` into the buffer along segment (x0,y0)-(x1,y1) with half-width `half` (texels). */
function drawSegment(pixels, pw, ph, x0, y0, x1, y1, half, color, opacity) {
  const pad = half + 1;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - pad));
  const maxX = Math.min(pw - 1, Math.ceil(Math.max(x0, x1) + pad));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - pad));
  const maxY = Math.min(ph - 1, Math.ceil(Math.max(y0, y1) + pad));
  const sx = x1 - x0;
  const sy = y1 - y0;
  const lenSq = sx * sx + sy * sy || 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5 - x0;
      const py = y + 0.5 - y0;
      const t = Math.max(0, Math.min(1, (px * sx + py * sy) / lenSq));
      const dx = px - t * sx;
      const dy = py - t * sy;
      const coverage = clamp01(half + 0.5 - Math.sqrt(dx * dx + dy * dy)) * opacity;
      if (coverage <= 0) continue;
      const o = (y * pw + x) * 4;
      pixels[o] += (color[0] - pixels[o]) * coverage;
      pixels[o + 1] += (color[1] - pixels[o + 1]) * coverage;
      pixels[o + 2] += (color[2] - pixels[o + 2]) * coverage;
    }
  }
}

function drawRivers(world, pixels, pw, ph, scale) {
  const { width: W, riverDir, riverSize, tiles } = world;
  const widths = [0, 0.2, 0.32, 0.46]; // in tiles
  for (let i = 0; i < riverSize.length; i++) {
    const size = riverSize[i];
    if (size === 0) continue;
    const dir = riverDir[i];
    const x = i % W;
    const y = (i - x) / W;
    const tx = x + DIR_DX[dir];
    const ty = y + DIR_DY[dir];
    const targetIsWater = tiles[ty * W + tx] <= TERRAIN.SHALLOW_WATER || tiles[ty * W + tx] === TERRAIN.LAKE;
    // Rivers stop at the shore of a lake or sea instead of painting over it.
    const ex = targetIsWater ? (x + tx) / 2 + 0.5 : tx + 0.5;
    const ey = targetIsWater ? (y + ty) / 2 + 0.5 : ty + 0.5;
    const half = Math.max(0.5 * widths[size] * scale, 0.6 + 0.22 * (size - 1));
    drawSegment(pixels, pw, ph, (x + 0.5) * scale, (y + 0.5) * scale, ex * scale, ey * scale, half, RIVER_COLOR, 0.92);
  }
}

/**
 * @param {import('./World.js').World} world A generated world (needs elevation, biomes, moisture, rivers).
 * @param {{ scale?: number }} [options] Texels per tile.
 * @returns {{ width: number, height: number, scale: number, pixels: Uint8ClampedArray }}
 */
export function paintWorld(world, { scale = 4 } = {}) {
  for (const layer of ['elevation', 'biomes', 'moisture', 'riverSize', 'riverDir']) {
    if (!world[layer]) throw new Error(`paintWorld: world.${layer} is missing (generate the world with WorldGenerator).`);
  }
  const W = world.width;
  const H = world.height;
  const S = Math.max(1, Math.round(scale));
  const PW = W * S;
  const PH = H * S;

  // --- Per-tile tables
  const total = W * H;
  const cr = new Float32Array(total);
  const cg = new Float32Array(total);
  const cb = new Float32Array(total);
  const field = new Float32Array(total); // < 0 water, > 0 land, with a per-tile wobble for organic shores
  for (let i = 0; i < total; i++) {
    const c = tileColor(world, i);
    cr[i] = c[0];
    cg[i] = c[1];
    cb[i] = c[2];
    const t = world.tiles[i];
    const water = t === TERRAIN.DEEP_WATER || t === TERRAIN.SHALLOW_WATER || t === TERRAIN.LAKE;
    const wobble = (hash2D(0x7a11, i % W, (i / W) | 0) - 0.5) * 1.2;
    field[i] = (water ? -1 : 1) + wobble;
  }
  const shade = computeShade(world);

  // --- Column interpolation tables (shared by every row)
  const colX0 = new Int32Array(PW);
  const colX1 = new Int32Array(PW);
  const colFx = new Float32Array(PW);
  for (let px = 0; px < PW; px++) {
    const u = (px + 0.5) / S - 0.5;
    const x0 = Math.floor(u);
    colFx[px] = u - x0;
    colX0[px] = Math.max(0, Math.min(W - 1, x0));
    colX1[px] = Math.max(0, Math.min(W - 1, x0 + 1));
  }

  const pixels = new Uint8ClampedArray(PW * PH * 4);
  const grainShift = S >= 4 ? 1 : 0;

  for (let py = 0; py < PH; py++) {
    const v = (py + 0.5) / S - 0.5;
    const y0 = Math.floor(v);
    const fy = v - y0;
    const row0 = Math.max(0, Math.min(H - 1, y0)) * W;
    const row1 = Math.max(0, Math.min(H - 1, y0 + 1)) * W;
    const nearRow = fy < 0.5 ? row0 : row1;

    for (let px = 0; px < PW; px++) {
      const fx = colFx[px];
      const i00 = row0 + colX0[px];
      const i10 = row0 + colX1[px];
      const i01 = row1 + colX0[px];
      const i11 = row1 + colX1[px];
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const f = field[i00] * w00 + field[i10] * w10 + field[i01] * w01 + field[i11] * w11;
      const water = f < 0;
      const nearest = nearRow + (fx < 0.5 ? colX0[px] : colX1[px]);

      // Blend only neighbours on the same side of the shoreline.
      let sw = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let sh = 0;
      if (field[i00] < 0 === water) { sw += w00; r += cr[i00] * w00; g += cg[i00] * w00; b += cb[i00] * w00; sh += shade[i00] * w00; }
      if (field[i10] < 0 === water) { sw += w10; r += cr[i10] * w10; g += cg[i10] * w10; b += cb[i10] * w10; sh += shade[i10] * w10; }
      if (field[i01] < 0 === water) { sw += w01; r += cr[i01] * w01; g += cg[i01] * w01; b += cb[i01] * w01; sh += shade[i01] * w01; }
      if (field[i11] < 0 === water) { sw += w11; r += cr[i11] * w11; g += cg[i11] * w11; b += cb[i11] * w11; sh += shade[i11] * w11; }
      if (sw < 1e-4) {
        r = cr[nearest]; g = cg[nearest]; b = cb[nearest]; sh = shade[nearest];
      } else {
        r /= sw; g /= sw; b /= sw; sh /= sw;
      }

      const terrain = world.tiles[nearest];
      // Hill shading (land only) and canopy / rock grain.
      let light = water ? 1 : 1 + sh * SHADE_STRENGTH[terrain];
      const noise = hash2D(0x3c71, px >> grainShift, py >> grainShift) - 0.5;
      light *= 1 + noise * 2 * GRAIN[terrain];

      const o = (py * PW + px) * 4;
      pixels[o] = r * light;
      pixels[o + 1] = g * light;
      pixels[o + 2] = b * light;
      pixels[o + 3] = 255;
    }
  }

  drawRivers(world, pixels, PW, PH, S);
  return { width: PW, height: PH, scale: S, pixels };
}
