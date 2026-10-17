// Map ramps. Each was generated in OKLCH and checked with a colorblind-safety validator: lightness steps
// read light to dark, and every light end stands out from the land color by at least 2:1.
export const RAMP = {
  gold: ['#D9A02C', '#B48217', '#8F660C', '#6C4C06', '#4A3303'],
  orange: ['#FA8746', '#D76821', '#AF4E06', '#843904', '#5C2602'],
  blue: ['#589CE6', '#3E82C9', '#2268AE', '#064F8F', '#01386A'],
  red: ['#FD8175', '#E15A50', '#BD3933', '#9B1014', '#6F0007'],
  teal: ['#38ABB1', '#079096', '#057479', '#085A5D', '#024143'],
  brown: ['#D49E6F', '#B47F51', '#946233', '#754614', '#542D01'],
  green: ['#5BAE5F', '#3F9446', '#227A2D', '#016016', '#054510'],
  purple: ['#B699EB', '#987ACA', '#7A5DA9', '#5D408A', '#43236B'],
  divRed: ['#FC8175', '#C74B43', '#901114'],
  divBlue: ['#589CE6', '#2C71B7', '#034884'],
  divDry: ['#D89C67', '#A46C36', '#713F03'],
  divWet: ['#3FA8BF', '#027C91', '#02515F'],
  divGreen: ['#60AD64', '#34823B', '#045815'],
};

/** Gray for "none" and the diverging midpoint. Distinct from a hollow county, which means no data. */
export const NEUTRAL = '#D6D4CC';
/** The U.S. Drought Monitor's own legend, index 0 = no drought, 1..5 = D0..D4. */
export const USDM = ['#D6D4CC', '#FFFF00', '#FCD37F', '#FFAA00', '#E60000', '#730000'];
export const SEVERITY = ['No drought', 'D0 Abnormally dry', 'D1 Moderate drought', 'D2 Severe drought', 'D3 Extreme drought', 'D4 Exceptional drought'];
export const SEVERITY_SHORT = ['None', 'D0', 'D1', 'D2', 'D3', 'D4'];
export const SEVERITY_WORD = ['None', 'Dry', 'Moderate', 'Severe', 'Extreme', 'Exceptional'];

// Fixed map colors: the map stays light in both themes, as Google Maps does on the web.
export const MAP = {
  ocean: [169, 200, 218] as [number, number, number],
  land: [241, 239, 230] as [number, number, number],
  ghost: [226, 224, 216] as [number, number, number],
  ink: [20, 32, 26] as [number, number, number],
};

export const rgb = (hex: string): [number, number, number] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
