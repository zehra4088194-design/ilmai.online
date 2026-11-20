import 'server-only';
import { createHash, timingSafeEqual } from 'crypto';

export type DiscountRow = {
  id: string; code: string; discount_type: 'percent'|'fixed';
  value: number; currency: string | null; paddle_discount_id: string | null;
};

export function discountedAmount(amount: number, currency: string, discount: DiscountRow | null) {
  if (!discount) return Math.round(amount * 100) / 100;
  if (discount.discount_type === 'fixed' && discount.currency !== currency)
    throw new Error('This discount is not valid for the selected currency');
  const cut = discount.discount_type === 'percent'
    ? amount * (Number(discount.value) / 100)
    : Number(discount.value);
  return Math.max(0,Math.round((amount-cut)*100)/100);
}

export function payProSignature(fields: Record<string, unknown>, secret: string) {
  const source = Object.entries(fields)
    .filter(([key,value]) => key !== 'sign' && value !== undefined && value !== null && value !== '')
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([key,value]) => key + '=' + String(value))
    .join('');
  return createHash('md5').update(source + secret,'utf8').digest('hex');
}

export function verifyPayProSignature(fields: Record<string, unknown>, secret: string, signature: string) {
  const expected = Buffer.from(payProSignature(fields,secret),'hex');
  let supplied: Buffer;
  try { supplied = Buffer.from(signature,'hex'); } catch { return false; }
  return expected.length===supplied.length && timingSafeEqual(expected,supplied);
}

export function timestampIsFresh(value: unknown, toleranceMs = 5*60_000, now = Date.now()) {
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) && Math.abs(now-timestamp)<=toleranceMs;
}

export function formatPayProMobile(value: string) {
  const digits=value.replace(/[^\d]/g,'');
  if (/^03\d{9}$/.test(digits)) return digits;
  if (/^3\d{9}$/.test(digits)) return digits;
  throw new Error('Use a Pakistani mobile number such as 03XXXXXXXXX');
}
