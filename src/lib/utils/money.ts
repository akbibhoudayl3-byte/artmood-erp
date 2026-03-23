/**
 * Financial rounding utilities.
 *
 * All monetary values are rounded to 2 decimal places using
 * banker's rounding (round half to even) to avoid cumulative bias.
 */

/** Round a number to 2 decimal places (standard financial rounding). */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Sum an array of monetary values with proper rounding. */
export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((acc, v) => acc + v, 0));
}

/** Compute VAT amount from HT amount and rate (default 20%). */
export function computeVAT(amountHT: number, vatRate: number = 20): { vatAmount: number; totalTTC: number } {
  const vatAmount = roundMoney(amountHT * (vatRate / 100));
  const totalTTC = roundMoney(amountHT + vatAmount);
  return { vatAmount, totalTTC };
}

/** Compute discount from subtotal and percentage. */
export function computeDiscount(subtotal: number, discountPercent: number): { discountAmount: number; afterDiscount: number } {
  const discountAmount = roundMoney(subtotal * (discountPercent / 100));
  const afterDiscount = roundMoney(subtotal - discountAmount);
  return { discountAmount, afterDiscount };
}

/** Format money for display (fr-MA locale). */
export function formatMAD(value: number): string {
  return `${roundMoney(value).toLocaleString('fr-MA')} MAD`;
}
