/**
 * Initial settlement placement.
 *
 * Every land tile is scored from its surroundings (fertile soil, fresh water,
 * nearby forest, stone and wood, how accessible the terrain is), unusable
 * tiles are rejected (ocean, lakes, mountains, snow, swamp, no fresh water
 * nearby), and sites are then picked best-first while keeping a minimum
 * distance from every settlement already chosen.
 *
 * Deterministic: the result depends only on the world data, the seed and the
 * config; a hash of the tile position breaks score ties.
 */
import { hash2D } from '../../utils/Noise.js';
import { TERRAIN_INFO } from '../../world/terrain.js';
import { SiteAnalyzer } from './SiteAnalysis.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * @param {import('../../world/World.js').World} world
 * @param {{ seedValue: number, config: ReturnType<import('../../config/settlementConfig.js').createSettlementConfig>,
 *           analyzer?: SiteAnalyzer }} options
 * @returns {{ sites: Array<{x:number,y:number,score:number}>, minDistance: number,
 *             targetCount: number, landTiles: number, candidates: number }}
 */
export function placeInitialSettlements(world, { seedValue, config, analyzer = null }) {
  const placement = config.placement;
  const W = world.width;
  const H = world.height;

  let landTiles = 0;
  for (let i = 0; i < world.tiles.length; i++) if (!TERRAIN_INFO[world.tiles[i]].isWater) landTiles++;
  const targetCount = clamp(Math.round(landTiles / placement.tilesPerSettlement), placement.minSettlements, placement.maxSettlements);

  const site = analyzer ?? new SiteAnalyzer(world, placement.siteRadius);

  // --- Score every tile once.
  const scores = new Float32Array(W * H).fill(-1);
  const tieSeed = (seedValue ^ 0x5e771e) >>> 0;
  let candidates = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const score = site.scoreAt(x, y, placement);
      if (score < placement.minScore) continue;
      scores[y * W + x] = score + hash2D(tieSeed, x, y) * 1e-4; // deterministic tie-break
      candidates++;
    }
  }

  const order = new Uint32Array(candidates);
  let n = 0;
  for (let i = 0; i < scores.length; i++) if (scores[i] >= 0) order[n++] = i;
  order.sort((a, b) => scores[b] - scores[a] || a - b);

  // --- Pick best-first with a minimum spacing; relax the spacing if too few fit.
  const spacing = Math.sqrt(Math.max(1, landTiles) / Math.max(1, targetCount)) * placement.spreadFactor;
  let minDistance = Math.max(placement.minDistance, Math.round(spacing));
  let sites = pick(order, scores, W, H, minDistance, targetCount);
  while (sites.length < targetCount && minDistance > placement.minDistance) {
    minDistance = Math.max(placement.minDistance, Math.floor(minDistance * 0.85));
    sites = pick(order, scores, W, H, minDistance, targetCount);
  }
  return { sites, minDistance, targetCount, landTiles, candidates };
}

/** Greedy best-first selection with a spatial hash for the distance test. */
function pick(order, scores, W, H, minDistance, targetCount) {
  const cell = Math.max(1, minDistance);
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);
  const head = new Int32Array(cols * rows).fill(-1);
  const next = new Int32Array(targetCount).fill(-1);
  const sites = [];
  const minSq = minDistance * minDistance;

  for (let k = 0; k < order.length && sites.length < targetCount; k++) {
    const index = order[k];
    const x = index % W;
    const y = (index - x) / W;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    let blocked = false;
    for (let gy = Math.max(0, cy - 1); gy <= Math.min(rows - 1, cy + 1) && !blocked; gy++) {
      for (let gx = Math.max(0, cx - 1); gx <= Math.min(cols - 1, cx + 1); gx++) {
        for (let s = head[gy * cols + gx]; s !== -1; s = next[s]) {
          const dx = sites[s].x - x;
          const dy = sites[s].y - y;
          if (dx * dx + dy * dy < minSq) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
      }
    }
    if (blocked) continue;
    const id = sites.length;
    sites.push({ x, y, score: Math.min(1, scores[index]) });
    next[id] = head[cy * cols + cx];
    head[cy * cols + cx] = id;
  }
  return sites;
}
