export function pageNumber(value?: string) { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10000) : 1; }
export const PAGE_SIZE = 20;
