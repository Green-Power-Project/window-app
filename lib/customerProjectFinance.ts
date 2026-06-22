/** Customer-facing finance: mirrors admin ProjectIncome payment vs project-value split. */

export const PROJECT_VALUE_TYPES = new Set(['quotation', 'change_order', 'report']);

const INVOICE_TYPES = new Set(['progress_payment', 'final_invoice']);

export const CUSTOMER_VAT_RATE = 0.19;

export type CustomerPaymentType =
  | 'progress_payment'
  | 'final_invoice'
  | 'cash'
  | 'bank_transfer'
  | 'partial_payment'
  | 'discount_skonto';

export function isProjectValueType(type: string): boolean {
  return PROJECT_VALUE_TYPES.has(type);
}

export function incomeNetAmount(data: {
  type: string;
  amount: number;
  discount?: number | null;
  cashPercent?: number | null;
}): number {
  const base = typeof data.amount === 'number' ? data.amount : 0;
  if (data.type === 'cash') {
    return base * (1 + (typeof data.cashPercent === 'number' ? data.cashPercent : 0) / 100);
  }
  if (INVOICE_TYPES.has(data.type)) {
    return base * (1 - (typeof data.discount === 'number' ? data.discount : 0) / 100);
  }
  return base;
}

export function netToGross(net: number): number {
  return net * (1 + CUSTOMER_VAT_RATE);
}
