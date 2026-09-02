import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: any) {
  const num = Number(amount);
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(isNaN(num) ? 0 : num);
}

export function safeDateStr(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      const d = val.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    }
    if (val instanceof Date) {
      if (!isNaN(val.getTime())) {
        return val.toISOString().split('T')[0];
      }
      return '';
    }
    if (typeof val.seconds === 'number') {
      const d = new Date(val.seconds * 1000);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    }
  }
  return String(val || '');
}

export function safeDateOnly(val: any): string {
  const str = safeDateStr(val);
  if (!str) return '';
  return str.split('T')[0];
}

export function safeSplit(val: any, delimiter: string | RegExp = '-'): string[] {
  if (!val && val !== 0) return [];
  const str = typeof val === 'string' ? val : safeDateStr(val);
  if (typeof str.split === 'function') {
    return str.split(delimiter);
  }
  return String(str || '').split(delimiter);
}
