import type { CropKey, StateCode } from './types';

export const STATES: Record<StateCode, string> = { CA: 'California', DE: 'Delaware', IA: 'Iowa', NE: 'Nebraska' };
export const STATE_CODES = Object.keys(STATES) as StateCode[];
export const STATE_BY_FIPS: Record<string, StateCode> = { '06': 'CA', '10': 'DE', '19': 'IA', '31': 'NE' };
/** Longitude, latitude and zoom that frame each state. */
export const STATE_VIEW: Record<StateCode, [number, number, number]> = {
  IA: [-93.4, 42.0, 6.0],
  NE: [-99.8, 41.5, 5.6],
  CA: [-119.5, 37.3, 4.9],
  DE: [-75.5, 39.0, 7.3],
};

export const CROPS: CropKey[] = ['C', 'S', 'W', 'G'];
export const CROP_NAME: Record<CropKey, string> = { C: 'corn', S: 'soybeans', W: 'winter wheat', G: 'sorghum' };
export const CROP_TITLE: Record<CropKey, string> = { C: 'Corn', S: 'Soybeans', W: 'Winter wheat', G: 'Sorghum' };
export const SEASON_LABEL: Record<CropKey, string> = { C: 'May–Sep', S: 'May–Oct', W: 'Sep–Jun', G: 'Jun–Oct' };
/** Calendar months of each crop's growing season that fall in the harvest year (winter wheat starts the September before). */
export const SEASON_MONTHS: Record<CropKey, number[]> = {
  C: [5, 6, 7, 8, 9],
  S: [5, 6, 7, 8, 9, 10],
  W: [1, 2, 3, 4, 5, 6],
  G: [6, 7, 8, 9, 10],
};
export const MAX_WEEKS: Record<CropKey, number> = { C: 22, S: 27, W: 44, G: 22 };

export const MONTH_LETTER = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A season counts as a severe-drought season at 4+ weeks in D2 or worse; below that, yields barely move in this data. */
export const SEVERE_WEEKS = 4;
