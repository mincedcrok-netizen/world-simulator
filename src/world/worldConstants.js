/**
 * Shared numeric conventions of generated worlds.
 *
 * Elevation is a float in [0, 1]:
 *   0 .. SEA_LEVEL   ocean floor (0 = deepest)
 *   SEA_LEVEL .. 1   land (1 = highest peak of that world)
 * Sea level is always exactly 0.5, whatever the water-coverage setting is.
 */
export const SEA_LEVEL = 0.5;

/** Ocean tiles above this elevation are shallow coastal water. */
export const SHALLOW_LEVEL = 0.3667;

/** Land at or above these elevations becomes hills / mountains. */
export const HILL_LEVEL = 0.58;
export const MOUNTAIN_LEVEL = 0.74;
