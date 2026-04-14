/** Shared display formatters for World Studio panels */

export const fmtPos = (x: number, z: number): string =>
  `(${Math.round(x)}, ${Math.round(z)})`;

export const fmtLevel = (level: number): string => `Lv${level}`;

export const fmtLevelRange = (min: number, max: number): string =>
  `Lv${min}-${max}`;

export const fmtDistance = (d: number): string => `${Math.round(d)}m`;
