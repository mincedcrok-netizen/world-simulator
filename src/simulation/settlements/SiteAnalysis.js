/**
 * Analysis of the land around a point: how much fertile farmland, forest,
 * stone, wood and fresh water lies within a square of `radius` tiles.
 *
 * Two implementations that must agree (and are tested to):
 *  - computeSiteProfile : plain loops, used for one-off checks
 *  - SiteAnalyzer       : summed-area tables, so scoring EVERY tile of a
 *                         512x512 world costs O(1) per tile instead of O(r^2)
 *
 * Profiles are computed once when a settlement is founded and then cached on
 * the settlement.
 */
import { TERRAIN } from '../../world/terrain.js';

/** Terrain a settlement can farm. */
const FARMABLE = new Set([TERRAIN.PLAINS, TERRAIN.GRASS, TERRAIN.DESERT]);
/** Fertile soil below this richness (0-255) is not worth farming. */
const FARM_MIN_FERTILITY = 60;

/** How easy a terrain is to settle and reach (0 = impassable or unsuitable), indexed by terrain id. */
// DEEP, SHALLOW, SAND, GRASS, HILLS, MOUNTAIN, PLAINS, FOREST, DENSE, DESERT, TUNDRA, SNOW, SWAMP, LAKE
const ACCESS = [0, 0, 0.4, 1, 0.6, 0, 1, 0.7, 0.5, 0.35, 0.35, 0, 0, 0];

/** Amounts (in "fully rich tiles") that count as a perfect surrounding. */
const NORM = { farmland: 20, forage: 12, wood: 10, stone: 10, freshTiles: 8 };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Accessibility (0-1) of a terrain for settling; 0 = never settle here. */
export function terrainAccess(terrainId) {
  return ACCESS[terrainId] ?? 0;
}

function buildProfile(farmSum, forageSum, woodSum, stoneSum, freshTiles, centerFreshwater, centerTerrain) {
  const waterAccess = clamp(0.5 * (centerFreshwater / 255) + 0.5 * Math.min(1, freshTiles / NORM.freshTiles), 0, 1);
  return {
    /** Farmable fertile land in "fully fertile tiles". */
    farmland: farmSum / 255,
    /** Foraging/hunting land (forests) in "fully wooded tiles". */
    forage: forageSum / 255,
    wood: woodSum / 255,
    stone: stoneSum / 255,
    /** River and lake tiles within reach (fishing, drinking water). */
    freshwaterTiles: freshTiles,
    waterAccess,
    /** 0-1: wood and stone available to build with. */
    resourceScore: 0.5 * Math.min(1, woodSum / 255 / NORM.wood) + 0.5 * Math.min(1, stoneSum / 255 / NORM.stone),
    access: terrainAccess(centerTerrain),
  };
}

/** Per-tile layer values counted by the analysis. */
function layerValues(world, i) {
  const t = world.tiles[i];
  const r = world.resources;
  const fertile = r.fertileSoil[i];
  const wood = r.wood[i];
  return {
    farm: FARMABLE.has(t) && fertile >= FARM_MIN_FERTILITY ? fertile : 0,
    forage: t === TERRAIN.FOREST || t === TERRAIN.DENSE_FOREST ? wood : 0,
    wood,
    stone: r.stone[i],
    fresh: r.freshwater[i] === 255 ? 1 : 0,
  };
}

/** Straightforward implementation (reference). */
export function computeSiteProfile(world, x, y, radius) {
  let farm = 0;
  let forage = 0;
  let wood = 0;
  let stone = 0;
  let fresh = 0;
  const x0 = Math.max(0, x - radius);
  const x1 = Math.min(world.width - 1, x + radius);
  const y0 = Math.max(0, y - radius);
  const y1 = Math.min(world.height - 1, y + radius);
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const v = layerValues(world, yy * world.width + xx);
      farm += v.farm;
      forage += v.forage;
      wood += v.wood;
      stone += v.stone;
      fresh += v.fresh;
    }
  }
  const i = y * world.width + x;
  return buildProfile(farm, forage, wood, stone, fresh, world.resources.freshwater[i], world.tiles[i]);
}

export class SiteAnalyzer {
  /**
   * @param {import('../../world/World.js').World} world
   * @param {number} radius
   */
  constructor(world, radius) {
    if (!world.resources || !world.tiles) throw new Error('SiteAnalyzer needs a generated world with resources.');
    this.world = world;
    this.radius = radius;
    const W = world.width;
    const H = world.height;
    const stride = W + 1;
    const make = () => new Int32Array(stride * (H + 1));
    this._sat = { farm: make(), forage: make(), wood: make(), stone: make(), fresh: make() };
    this._stride = stride;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = layerValues(world, y * W + x);
        const here = (y + 1) * stride + (x + 1);
        const up = y * stride + (x + 1);
        const left = (y + 1) * stride + x;
        const diag = y * stride + x;
        for (const key of ['farm', 'forage', 'wood', 'stone', 'fresh']) {
          const sat = this._sat[key];
          sat[here] = v[key] + sat[up] + sat[left] - sat[diag];
        }
      }
    }
    this._sums = new Int32Array(5); // reused, so scoring allocates nothing
  }

  _boxSum(sat, x0, y0, x1, y1) {
    const s = this._stride;
    return sat[(y1 + 1) * s + (x1 + 1)] - sat[y0 * s + (x1 + 1)] - sat[(y1 + 1) * s + x0] + sat[y0 * s + x0];
  }

  _fill(x, y) {
    const { width: W, height: H } = this.world;
    const x0 = Math.max(0, x - this.radius);
    const x1 = Math.min(W - 1, x + this.radius);
    const y0 = Math.max(0, y - this.radius);
    const y1 = Math.min(H - 1, y + this.radius);
    const sums = this._sums;
    sums[0] = this._boxSum(this._sat.farm, x0, y0, x1, y1);
    sums[1] = this._boxSum(this._sat.forage, x0, y0, x1, y1);
    sums[2] = this._boxSum(this._sat.wood, x0, y0, x1, y1);
    sums[3] = this._boxSum(this._sat.stone, x0, y0, x1, y1);
    sums[4] = this._boxSum(this._sat.fresh, x0, y0, x1, y1);
    return sums;
  }

  /** Full profile of the land around (x, y). */
  profileAt(x, y) {
    const s = this._fill(x, y);
    const i = y * this.world.width + x;
    return buildProfile(s[0], s[1], s[2], s[3], s[4], this.world.resources.freshwater[i], this.world.tiles[i]);
  }

  /**
   * Suitability (0-1) of a tile as a settlement site, or -1 when the tile is
   * unusable (impassable or unsuitable terrain, or no fresh water nearby).
   * Allocates nothing.
   */
  scoreAt(x, y, placement) {
    const i = y * this.world.width + x;
    const access = ACCESS[this.world.tiles[i]];
    if (!(access > 0)) return -1;
    const fresh = this.world.resources.freshwater[i];
    if (fresh < placement.minFreshwater) return -1;

    const s = this._fill(x, y);
    const w = placement.weights;
    const farm = clamp(s[0] / 255 / NORM.farmland, 0, 1);
    const water = clamp(0.5 * (fresh / 255) + 0.5 * Math.min(1, s[4] / NORM.freshTiles), 0, 1);
    const forage = clamp(s[1] / 255 / NORM.forage, 0, 1);
    const resources = 0.5 * Math.min(1, s[2] / 255 / NORM.wood) + 0.5 * Math.min(1, s[3] / 255 / NORM.stone);
    const total = w.farmland + w.water + w.forage + w.resources + w.access;
    return (w.farmland * farm + w.water * water + w.forage * forage + w.resources * resources + w.access * access) / total;
  }
}
