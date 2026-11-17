/**
 * Basic climate model.
 *
 *  temperature  deg C, from latitude (equator hot, poles cold) minus a lapse
 *               rate for elevation, plus gentle noise.
 *  rainfall     0-255. Wet air blows in from the ocean along prevailing wind
 *               belts (trade winds / westerlies), loses water as it crosses
 *               land and especially when forced uphill (rain shadows behind
 *               mountains), and is blended with a latitude pattern (wet
 *               equator and mid-latitudes, dry subtropics and poles).
 *  moisture     0-255. Rainfall minus evaporation (heat), plus humidity near
 *               rivers, lakes and coasts. Biomes use moisture.
 */
import { createRng } from '../../utils/Random.js';
import { fbm2D } from '../../utils/Noise.js';
import { boxBlur, clamp, distanceField } from '../grid.js';
import { SEA_LEVEL } from '../worldConstants.js';

/** 0 at the equator (map middle row) to 1 at the poles (top and bottom rows). */
export function latitudeOf(y, size) {
  return Math.abs((2 * (y + 0.5)) / size - 1);
}

/** Latitude pattern of rainfall: wet equator, dry subtropics, wetter mid-latitudes, dry poles. */
function latitudeRain(lat) {
  return 0.18 + 0.62 * Math.exp(-((lat / 0.18) ** 2)) + 0.38 * Math.exp(-(((lat - 0.58) / 0.16) ** 2));
}

/**
 * @returns {{ temperature: Int8Array, rainfall: Uint8Array }}
 */
export function generateClimate(elevation, size, hydro, params, seed) {
  const total = size * size;
  const rng = createRng(seed);
  const seedTemp = rng.int(1, 0x3fffffff);
  const seedRain = rng.int(1, 0x3fffffff);
  const { ocean } = hydro;

  // --- Temperature
  const temperature = new Int8Array(total);
  const tempNoiseFreq = 1 / (0.3 * size);
  const tempNoiseAmp = 7 * params.climateNoise;
  for (let y = 0; y < size; y++) {
    const lat = latitudeOf(y, size);
    const base = 30 - 58 * lat ** 1.6;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let t = base + (fbm2D(seedTemp, x * tempNoiseFreq, y * tempNoiseFreq, 3) - 0.5) * tempNoiseAmp;
      if (!ocean[i]) {
        const h = Math.max(0, (elevation[i] - SEA_LEVEL) / SEA_LEVEL);
        t -= 34 * h ** 1.1; // lapse rate: mountain tops are cold
      }
      temperature[i] = clamp(Math.round(t), -60, 50);
    }
  }

  // --- Rainfall: moist air advected along the wind, depleted over land and uphill.
  const advected = new Float32Array(total);
  const sizeScale = 256 / size; // keep geography proportional on every map size
  const decay = 0.025 * sizeScale ** 0.8;
  const recharge = 0.004 * sizeScale;
  for (let y = 0; y < size; y++) {
    const lat = latitudeOf(y, size);
    const dir = lat < 0.3 || lat > 0.66 ? -1 : 1; // trade winds / polar easterlies vs westerlies
    let moist = 0.65;
    let prev = SEA_LEVEL;
    for (let k = 0; k < size; k++) {
      const x = dir > 0 ? k : size - 1 - k;
      const i = y * size + x;
      if (ocean[i]) {
        const capacity = 0.5 + 0.5 * clamp(temperature[i] / 30, 0, 1);
        moist += (capacity - moist) * 0.2;
        prev = SEA_LEVEL;
        continue;
      }
      const e = elevation[i];
      const uphill = Math.max(0, e - prev);
      prev += (e - prev) * 0.5;
      const precip = Math.min(moist * 0.5, moist * (decay + uphill * 12));
      moist = moist - precip + recharge;
      advected[i] = Math.min(1, precip * 16);
    }
  }
  const blurRadius = Math.max(1, Math.round(size / 128));
  const smooth = boxBlur(advected, size, size, blurRadius, 2);

  const rainfall = new Uint8Array(total);
  const rainNoiseFreq = 1 / (0.18 * size);
  const rainNoiseAmp = 0.3 * params.climateNoise;
  for (let y = 0; y < size; y++) {
    const band = latitudeRain(latitudeOf(y, size));
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const noise = (fbm2D(seedRain, x * rainNoiseFreq, y * rainNoiseFreq, 3) - 0.5) * rainNoiseAmp;
      const value = ocean[i] ? band * 0.6 : 0.45 * band + 0.55 * smooth[i] + noise;
      rainfall[i] = Math.round(clamp(value, 0, 1) * 255);
    }
  }
  return { temperature, rainfall };
}

/**
 * Effective moisture: rainfall minus evaporation, plus humidity near fresh
 * water and the coast. Must run after rivers exist.
 *
 * @returns {{ moisture: Uint8Array, freshDistance: Uint8Array, coastDistance: Uint8Array }}
 */
export function computeMoisture(size, { rainfall, temperature, ocean, lakeId, riverSize }) {
  const total = size * size;
  const freshSources = new Uint8Array(total);
  for (let i = 0; i < total; i++) freshSources[i] = lakeId[i] !== 0 || riverSize[i] !== 0 ? 1 : 0;
  const freshDistance = distanceField(size, size, freshSources, 6);
  const coastDistance = distanceField(size, size, ocean, 8);

  const moisture = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (ocean[i]) {
      moisture[i] = 255;
      continue;
    }
    const rain = rainfall[i] / 255;
    const evaporation = (Math.max(0, temperature[i]) / 50) * 0.15;
    const fresh = freshDistance[i] <= 4 ? 1 - freshDistance[i] / 5 : 0;
    const coast = coastDistance[i] <= 6 ? 1 - coastDistance[i] / 7 : 0;
    moisture[i] = Math.round(clamp(rain + 0.05 - evaporation + 0.18 * fresh + 0.06 * coast, 0, 1) * 255);
  }
  return { moisture, freshDistance, coastDistance };
}
