// The MCP tools: read-only questions an AI assistant can ask about Agrigine's county data.
import { account, loadCounty, loadDailyYear, loadIndex, loadNormals, loadSeason, type County, type CropKey, type Ctx, type Env, type Index } from './data';

const FIRST_YEAR = 2000, LAST_YEAR = 2025;
const DAY0 = Date.UTC(2000, 0, 1), DAY = 864e5;
const CROPS: Record<string, CropKey> = { corn: 'C', soybeans: 'S', winter_wheat: 'W', sorghum: 'G' };
const CROP_NAME: Record<CropKey, string> = { C: 'corn', S: 'soybeans', W: 'winter wheat', G: 'grain sorghum' };
const CROP_INDEX: Record<CropKey, number> = { C: 0, S: 1, W: 2, G: 3 };
const STATES: Record<string, string> = { CA: 'California', DE: 'Delaware', IA: 'Iowa', NE: 'Nebraska' };
const DROUGHT = ['none', 'D0 abnormally dry', 'D1 moderate', 'D2 severe', 'D3 extreme', 'D4 exceptional'];
const STATUS: Record<string, string> = { r: 'reported', n: 'not reported by NASS', s: 'planted, but no grain harvested', '-': 'no record' };
const LOSS = ['drought', 'heat', 'too_wet', 'hail', 'wind', 'freeze', 'price_decline', 'other'];
const STORMS = ['hail', 'damaging_wind', 'tornado', 'flood', 'other'];
// [start month, start day, end month, end day, starts the year before harvest]
const WINDOWS: Record<CropKey, [number, number, number, number, boolean]> = { C: [5, 1, 9, 30, false], S: [5, 1, 10, 31, false], G: [6, 1, 10, 31, false], W: [9, 1, 6, 30, true] };
const WINDOW_LABEL: Record<CropKey, string> = { C: 'May 1 to Sep 30', S: 'May 1 to Oct 31', G: 'Jun 1 to Oct 31', W: 'Sep 1 of the year before to Jun 30' };
const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const dayOf = (iso: string) => {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? null : Math.round((t - DAY0) / DAY);
};
const isoOf = (day: number) => new Date(DAY0 + day * DAY).toISOString().slice(0, 10);
const round = (v: number | null | undefined, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

export class ToolError extends Error {}

// ---------- shared argument handling ----------

const crop = (v: unknown): CropKey => {
  const k = CROPS[String(v ?? '').toLowerCase().replace(/\s+/g, '_')];
  if (!k) throw new ToolError(`crop must be one of: ${Object.keys(CROPS).join(', ')}.`);
  return k;
};
const year = (v: unknown) => {
  const y = Number(v);
  if (!Number.isInteger(y) || y < FIRST_YEAR || y > LAST_YEAR) throw new ToolError(`year must be ${FIRST_YEAR} to ${LAST_YEAR}.`);
  return y;
};
const words = (s: string) => s.toLowerCase().replace(/[.,]/g, ' ').replace(/\bcounty\b/g, ' ').split(/\s+/).filter(Boolean);
const stateIn = (w: string[]) => Object.entries(STATES).find(([code, name]) => w.includes(code.toLowerCase()) || w.join(' ').includes(name.toLowerCase()))?.[0];

/** Counties and cities matching free text such as "Polk County, Iowa", "story ia" or "Ames". Exact names come first. */
function search(ix: Index, query: string) {
  const w = words(query), st = stateIn(w);
  const stateWords = new Set([...Object.keys(STATES).map(c => c.toLowerCase()), ...Object.values(STATES).map(n => n.toLowerCase())]);
  const name = w.filter(x => !stateWords.has(x)).join(' ');
  const inState = (s: string) => !st || s === st;
  const counties = ix.counties.filter(c => name && inState(c.s) && c.n.toLowerCase().startsWith(name));
  const cities = ix.cities.filter(c => name && inState(c[1]) && c[0].toLowerCase().startsWith(name)).sort((a, b) => b[5] - a[5]);
  const exact = <T>(list: T[], n: (x: T) => string) => [...list.filter(x => n(x).toLowerCase() === name), ...list.filter(x => n(x).toLowerCase() !== name)];
  return {
    name, state: st,
    counties: exact(counties, c => c.n), exactCounty: counties.some(c => c.n.toLowerCase() === name),
    cities: exact(cities, c => c[0]), exactCity: cities.some(c => c[0].toLowerCase() === name),
  };
}

/** A county from a 5-digit FIPS code or a name; a city name resolves to the county it is in. */
async function place(env: Env, v: unknown): Promise<{ county: County; via?: string }> {
  const text = String(v ?? '').trim();
  if (!text) throw new ToolError('place is required: a county name such as "Polk County, Iowa", a city such as "Ames, IA", or a 5-digit FIPS code.');
  const ix = await loadIndex(env);
  if (/^\d{5}$/.test(text)) {
    if (!ix.counties.some(c => c.f === text)) throw new ToolError(`FIPS ${text} is not in Agrigine, which covers California, Delaware, Iowa and Nebraska.`);
    return { county: await loadCounty(env, text) };
  }
  const m = search(ix, text);
  // "County" in the text means the county. A bare name means the county too, unless a city of 50,000+ has exactly
  // that name ("Des Moines" is the city; "Polk" is a county, not the 345-person town of Polk, NE).
  const bigCity = m.exactCity && m.cities[0][5] >= 50000;
  const wantCounty = m.counties.length > 0 && (/\bcounty\b/i.test(text) || (m.exactCounty && !bigCity) || !m.exactCity);
  if (wantCounty) {
    const same = m.counties.filter(c => c.n === m.counties[0].n);
    if (same.length > 1) throw new ToolError(`"${text}" matches ${same.map(c => `${c.n} County, ${STATES[c.s]} (${c.f})`).join('; ')}. Add the state or use the FIPS code.`);
    return { county: await loadCounty(env, m.counties[0].f) };
  }
  if (m.cities.length) {
    const city = m.cities[0];
    return { county: await loadCounty(env, city[2]), via: `${city[0]}, ${city[1]} is in this county` };
  }
  throw new ToolError(`No county or city in Agrigine matches "${text}". Agrigine covers California, Delaware, Iowa and Nebraska; try find_places.`);
}

const label = (c: County) => ({ county: `${c.n} County, ${STATES[c.s]}`, fips: c.f });
const at = <T>(a: T[] | undefined, i: number) => (a ? a[i] ?? null : null);

function insurance(c: County, k: CropKey, i: number) {
  const byCause: Record<string, number> = {};
  let total = 0;
  for (const [yi, ci, g, usd] of c.ins ?? []) {
    if (yi !== i || ci !== CROP_INDEX[k]) continue;
    total += usd;
    byCause[LOSS[g]] = (byCause[LOSS[g]] ?? 0) + usd;
  }
  return { total, byCause };
}

function storms(c: County, k: CropKey, y: number) {
  const [sm, sd, em, ed, before] = WINDOWS[k];
  const from = (Date.UTC(before ? y - 1 : y, sm - 1, sd) - DAY0) / DAY, to = (Date.UTC(y, em - 1, ed) - DAY0) / DAY;
  const counts = [0, 0, 0, 0, 0];
  let damage = 0;
  for (const e of c.ev ?? []) {
    if (e[0] < from || e[0] > to) continue;
    counts[e[1]]++;
    damage += e[3];
  }
  return { ...Object.fromEntries(STORMS.map((n, j) => [n, counts[j]])), reported_crop_damage_usd: damage };
}

// ---------- tools ----------

interface Tool {
  description: string;
  inputSchema: Record<string, unknown>;
  run: (env: Env, args: Record<string, unknown>, ctx: Ctx) => Promise<unknown>;
  /** Reads the connected person's own data; needs a personal key. */
  account?: boolean;
}

const PLACE = { type: 'string', description: 'A county ("Polk County, Iowa"), a city ("Ames, IA") or a 5-digit county FIPS code ("19153").' };
const CROP = { type: 'string', enum: Object.keys(CROPS), description: 'The crop.' };
const YEAR = { type: 'integer', minimum: FIRST_YEAR, maximum: LAST_YEAR, description: 'The harvest year. Winter wheat 2012 grew from fall 2011 to June 2012.' };
const SOURCES = 'USDA NASS yields; NOAA ACIS weather; U.S. Drought Monitor; USDA RMA crop insurance; NOAA Storm Events; USDA NRCS SSURGO soils; NASA MODIS.';

export const TOOLS: Record<string, Tool> = {
  find_places: {
    description: 'Find counties and cities in Agrigine by name and get their 5-digit FIPS codes. Agrigine covers every county in California, Delaware, Iowa and Nebraska.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'A county or city name, optionally with the state, e.g. "Polk", "Story County Iowa", "Grand Island".' } }, required: ['query'] },
    run: async (env, a) => {
      const ix = await loadIndex(env);
      const { counties, cities } = search(ix, String(a.query ?? ''));
      return {
        counties: counties.slice(0, 10).map(c => ({ county: `${c.n} County, ${STATES[c.s]}`, fips: c.f, crops: c.crops.map(k => CROP_NAME[k]) })),
        cities: cities.slice(0, 10).map(c => ({ city: `${c[0]}, ${c[1]}`, population_2024: c[5], county_fips: c[2], county: `${ix.counties.find(x => x.f === c[2])?.n} County` })),
      };
    },
  },

  get_county_season: {
    description: 'Everything Agrigine knows about one county, crop and season: yield vs its trend, acres, season rain and heat, drought, crop insurance payouts by cause, storm reports, soil, irrigation and satellite greenness.',
    inputSchema: { type: 'object', properties: { place: PLACE, crop: CROP, year: YEAR }, required: ['place', 'crop', 'year'] },
    run: async (env, a) => {
      const k = crop(a.crop), y = year(a.year), i = y - FIRST_YEAR;
      const { county: c, via } = await place(env, a.place);
      const d = c.d[k];
      if (!d) return { ...label(c), note: `${c.n} County has no NASS ${CROP_NAME[k]} record from 2000 to 2025. It grows: ${Object.keys(c.d).map(x => CROP_NAME[x as CropKey]).join(', ') || 'none of the four crops'}.` };
      const ins = insurance(c, k, i), ap = d.ap[i];
      const sw = c.sw?.[k], ir = c.ir?.[k];
      return {
        ...label(c), ...(via ? { matched_by: via } : {}), crop: CROP_NAME[k], year: y, season_window: WINDOW_LABEL[k],
        yield: { status: STATUS[d.st[i]] ?? 'no record', bushels_per_acre: d.st[i] === 'r' ? d.y[i] : null, vs_county_trend_pct: d.st[i] === 'r' ? d.a[i] : null, acres_planted: ap, acres_harvested: d.ah[i] },
        weather: {
          rain_mm: d.pr[i], rain_vs_normal_pct: d.pa[i], average_temp_c: d.tv[i], days_at_35c_or_hotter: d.ht[i], growing_degree_days: d.gd[i],
          hot_nights: at(sw?.hn, i), heat_days_at_flowering: at(sw?.fh, i), longest_dry_spell_days: at(sw?.dry, i), heavy_rain_days: at(sw?.hr, i),
        },
        drought: { worst_level: d.sv[i] == null ? null : DROUGHT[d.sv[i]!], weeks_in_d2_or_worse: d.wk[i], mean_dsci: d.ds[i] },
        crop_insurance: { paid_usd: ins.total, per_planted_acre_usd: ap ? round(ins.total / ap, 2) : null, by_cause_usd: ins.byCause },
        storm_reports_in_season: storms(c, k, y),
        soil: { water_storage_top_100cm_mm: c.aws, drought_prone_soil_pct: c.dr, crop_productivity_index_0_to_1: c.nc[k] ?? null },
        irrigation: ir ? { irrigated_share: at(ir.sh, i), yield_irrigated: at(ir.yi, i), yield_dryland: at(ir.yn, i) } : null,
        satellite: c.md ? { peak_ndvi: c.md.nx[i], ndvi_vs_normal_pct: c.md.na[i], peak_day_of_year: c.md.pk[i] } : null,
        notes: ['Yield vs trend compares with the county\'s own long-run trend.', 'Price decline insurance payouts are market losses on revenue policies, not crop damage.'],
        sources: SOURCES,
      };
    },
  },

  get_county_history: {
    description: 'Season-by-season history for one county and crop, 2000 to 2025: yield vs trend, worst drought, weeks in severe drought, rain vs normal, heat days and crop insurance payouts.',
    inputSchema: { type: 'object', properties: { place: PLACE, crop: CROP }, required: ['place', 'crop'] },
    run: async (env, a) => {
      const k = crop(a.crop);
      const { county: c, via } = await place(env, a.place);
      const d = c.d[k];
      if (!d) return { ...label(c), note: `${c.n} County has no NASS ${CROP_NAME[k]} record from 2000 to 2025.` };
      const seasons = d.y.map((_, i) => {
        const ins = insurance(c, k, i).total, ap = d.ap[i];
        return {
          year: FIRST_YEAR + i, yield_status: STATUS[d.st[i]] ?? 'no record',
          bushels_per_acre: d.st[i] === 'r' ? d.y[i] : null, vs_trend_pct: d.st[i] === 'r' ? d.a[i] : null,
          worst_drought: d.sv[i] == null ? null : DROUGHT[d.sv[i]!], weeks_d2_or_worse: d.wk[i], rain_vs_normal_pct: d.pa[i],
          days_35c_or_hotter: d.ht[i], insurance_paid_usd: ins, insurance_per_acre_usd: ap ? round(ins / ap, 2) : null,
        };
      });
      return { ...label(c), ...(via ? { matched_by: via } : {}), crop: CROP_NAME[k], season_window: WINDOW_LABEL[k], seasons, sources: SOURCES };
    },
  },

  get_daily_weather: {
    description: 'Day-by-day weather for one county over up to 62 days: high, low, rain, 30-day rain vs normal, days since rain, air dryness (VPD), crop water demand (ET0), root-zone soil moisture vs normal, 30-day water balance, and the Drought Monitor level that week.',
    inputSchema: {
      type: 'object',
      properties: { place: PLACE, start_date: { type: 'string', description: 'First day, YYYY-MM-DD, 2000-01-01 to 2025-12-31.' }, end_date: { type: 'string', description: 'Last day, YYYY-MM-DD. Defaults to start_date; at most 62 days after it.' } },
      required: ['place', 'start_date'],
    },
    run: async (env, a) => {
      const from = dayOf(String(a.start_date ?? '')), to = a.end_date ? dayOf(String(a.end_date)) : from;
      if (from == null || to == null) throw new ToolError('Dates must look like 2012-07-15.');
      if (to < from || to - from > 61) throw new ToolError('end_date must be on or after start_date and at most 62 days later.');
      if (from < 0 || to > (Date.UTC(LAST_YEAR, 11, 31) - DAY0) / DAY) throw new ToolError('Daily data covers 2000-01-01 to 2025-12-31.');
      const { county: c, via } = await place(env, a.place);
      const ix = await loadIndex(env), lay = ix.daily, ci = ix.counties.find(x => x.f === c.f)!.i;
      const normals = new Int16Array(await loadNormals(env));
      const week0 = dayOf(ix.weekStart)!;
      const days = [];
      for (let day = from; day <= to; day++) {
        const date = isoOf(day), y = Number(date.slice(0, 4));
        const n = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / DAY, idx = day - (Date.UTC(y, 0, 1) - DAY0) / DAY;
        const file = new Int16Array(await loadDailyYear(env, y));
        const v = (ch: string) => {
          const j = lay.channels.indexOf(ch);
          const raw = file[(j * lay.counties + ci) * n + idx];
          return raw === lay.missing || raw === undefined ? null : raw / lay.scale[j];
        };
        const slot = (Date.UTC(2000, Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) - DAY0) / DAY;
        const norm = (ch: string) => {
          const j = lay.normals.channels.indexOf(ch);
          const raw = normals[(j * lay.counties + ci) * lay.normals.days + slot];
          return raw === lay.missing || raw === undefined ? null : raw / lay.normals.scale[j];
        };
        const w = Math.floor((day - week0) / 7), cat = c.wkc && w >= 0 && 2 * w + 1 < c.wkc.length ? Number(c.wkc[2 * w]) : null;
        days.push({
          date, high_c: v('tmax'), low_c: v('tmin'), normal_high_c: round(norm('tmax')), rain_mm: v('pcpn'),
          rain_last_30_days_mm: v('rain30'), normal_rain_last_30_days_mm: norm('rain30'), days_since_rain: v('dry'),
          vpd_kpa: v('vpd'), crop_water_demand_et0_mm: v('et0'), soil_moisture_pct: v('soil'), normal_soil_moisture_pct: norm('soil'),
          water_balance_30_days_mm: v('wb30'), normal_water_balance_30_days_mm: norm('wb30'),
          drought_level_this_week: cat == null ? null : DROUGHT[cat], drought_dsci: cat == null ? null : Math.round((B62.indexOf(c.wkc![2 * w + 1]) / 61) * 500),
        });
      }
      return {
        ...label(c), ...(via ? { matched_by: via } : {}), days,
        notes: ['Normals are 2000-2025 averages for the calendar date.', 'Water balance is rain minus crop water demand (FAO-56 reference evapotranspiration) over the last 30 days.', 'Soil moisture is root-zone wetness, 0 (dry) to 100 (saturated).'],
        sources: 'NOAA ACIS daily weather; NASA POWER (VPD, ET0, soil moisture); U.S. Drought Monitor.',
      };
    },
  },

  rank_counties: {
    description: 'Rank a state\'s counties for one crop and season by a measure, for example the counties hit hardest by the 2012 drought in Iowa corn.',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: Object.keys(STATES), description: 'State code.' }, crop: CROP, year: YEAR,
        measure: { type: 'string', enum: ['yield_vs_trend', 'yield', 'weeks_in_severe_drought', 'rain_vs_normal', 'days_35c_or_hotter', 'insurance_per_acre'], description: 'What to rank by.' },
        order: { type: 'string', enum: ['worst_first', 'best_first'], description: 'worst_first (default) puts the counties with the worst outcome for crops first.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'How many counties to return (default 10).' },
      },
      required: ['state', 'crop', 'year', 'measure'],
    },
    run: async (env, a) => {
      const st = String(a.state ?? '').toUpperCase();
      if (!STATES[st]) throw new ToolError(`state must be one of ${Object.keys(STATES).join(', ')}.`);
      const k = crop(a.crop), y = year(a.year), i = y - FIRST_YEAR, m = String(a.measure);
      const limit = Math.min(100, Math.max(1, Number(a.limit) || 10));
      let rows;
      try { rows = await loadSeason(env, st, k); } catch { return { note: `No ${STATES[st]} county has a NASS ${CROP_NAME[k]} record.` }; }
      const value = (r: (typeof rows)[string]) => {
        switch (m) {
          case 'yield_vs_trend': return r.st[i] === 'r' ? r.a[i] : null;
          case 'yield': return r.st[i] === 'r' ? r.y[i] : null;
          case 'weeks_in_severe_drought': return r.wk[i];
          case 'rain_vs_normal': return r.pa[i];
          case 'days_35c_or_hotter': return r.ht[i];
          case 'insurance_per_acre': return r.ap[i] ? round(r.ins[i] / r.ap[i]!, 2) : null;
          default: throw new ToolError('Unknown measure.');
        }
      };
      // "Worst for crops" is low for yield and rain, high for drought, heat and payouts.
      const lowIsBad = ['yield_vs_trend', 'yield', 'rain_vs_normal'].includes(m);
      const worstFirst = a.order !== 'best_first';
      const ranked = Object.entries(rows).map(([f, r]) => ({ county: `${r.n} County`, fips: f, value: value(r) }))
        .filter((r): r is { county: string; fips: string; value: number } => r.value != null)
        .sort((p, q) => ((lowIsBad === worstFirst) ? p.value - q.value : q.value - p.value));
      return { state: STATES[st], crop: CROP_NAME[k], year: y, measure: m, order: worstFirst ? 'worst first' : 'best first', counties_with_data: ranked.length, ranking: ranked.slice(0, limit).map((r, j) => ({ rank: j + 1, ...r })), sources: SOURCES };
    },
  },

  // ---------- the connected person's own data (needs a personal key from the Profile page) ----------

  my_farms: {
    description: 'The connected person\'s farms (name, county FIPS, location) and the models they built from their own records, with each model\'s settings, how it tested (leave-one-season-out MAE and skill vs the farm\'s average) and its predicted yields for 2026–2028 with 80% ranges. Needs a personal key.',
    inputSchema: { type: 'object', properties: {} },
    account: true,
    run: async (env, _a, ctx) => {
      const farms = await account<Record<string, unknown>[]>(env, ctx, 'mcp_farms');
      if (!farms.length) return { farms: [], note: 'No farms yet. Add one on the Predict page.' };
      const ix = await loadIndex(env);
      return { farms: farms.map(f => ({ ...f, county: (c => (c ? `${c.n} County, ${STATES[c.s]}` : null))(ix.counties.find(c => c.f === f.fips)) })) };
    },
  },

  my_records: {
    description: 'The connected person\'s own field records (field, county, crop, year, yield in bu/ac, acres, planting and harvest dates, irrigation, notes), optionally for one county and crop. Needs a personal key.',
    inputSchema: { type: 'object', properties: { fips: { type: 'string', description: 'Optional 5-digit county FIPS code.' }, crop: { type: 'string', description: 'Optional: corn, soybeans, winter_wheat or sorghum.' } } },
    account: true,
    run: async (env, a, ctx) => {
      const fips = a.fips == null ? null : String(a.fips), k = a.crop == null ? null : CROP_NAME[crop(a.crop)].replace('grain sorghum', 'sorghum').replace(' ', '_');
      const records = await account<Record<string, unknown>[]>(env, ctx, 'mcp_records', { p_fips: fips, p_crop: k });
      return { count: records.length, records: records.slice(0, 500), truncated: records.length > 500 };
    },
  },

  my_reports: {
    description: 'The connected person\'s saved Agrigine reports: title, places, crop, years, and the blocks in each. Needs a personal key.',
    inputSchema: { type: 'object', properties: {} },
    account: true,
    run: async (env, _a, ctx) => ({ reports: await account<unknown[]>(env, ctx, 'mcp_reports') }),
  },
};
