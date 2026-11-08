/** Split-test math. Pure module. */

function erf(x: number) {
  // Abramowitz & Stegun 7.1.26
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export const normCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

export type Significance = {
  rate: number; control_rate: number; uplift: number | null; z: number | null; p_value: number | null;
  /** 0..100: 1 - two-sided p-value. */
  confidence: number | null;
  /** 0..100: probability the variant beats control (one-sided). */
  chance_to_beat: number | null;
  significant: boolean;
};

/** Two-proportion z-test of a variant (conversions/visitors) against control. */
export function significance(conv: number, n: number, convC: number, nC: number): Significance {
  const rate = n > 0 ? conv / n : 0;
  const control_rate = nC > 0 ? convC / nC : 0;
  const uplift = control_rate > 0 ? (rate - control_rate) / control_rate : null;
  if (n < 1 || nC < 1) return { rate, control_rate, uplift, z: null, p_value: null, confidence: null, chance_to_beat: null, significant: false };
  const pooled = (conv + convC) / (n + nC);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n + 1 / nC));
  if (!se) return { rate, control_rate, uplift, z: null, p_value: null, confidence: null, chance_to_beat: null, significant: false };
  const z = (rate - control_rate) / se;
  const p = 2 * (1 - normCdf(Math.abs(z)));
  const confidence = Math.max(0, Math.min(100, (1 - p) * 100));
  return { rate, control_rate, uplift, z, p_value: p, confidence, chance_to_beat: normCdf(z) * 100, significant: confidence >= 95 };
}
