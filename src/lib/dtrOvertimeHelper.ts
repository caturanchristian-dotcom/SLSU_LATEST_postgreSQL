import { safeDateOnly, safeSplit } from './utils';

export interface OvertimeRequestRecord {
  id: string;
  employeeId: string;
  overtimeDate: string;
  startTime: string;
  endTime: string;
  requestedHours?: number;
  approvedHours?: number;
  payableHours?: number;
  status: string;
  reason: string;
  approverName?: string;
  approverId?: string;
  approvalRemarks?: string;
  documentUrl?: string;
  createdAt?: string;
}

/**
 * Parse time string (e.g., "17:00", "05:00 PM", "5:00 pm", "7:00") into minutes from midnight.
 */
export function parseTimeToMinutes(tStr: any): number {
  if (!tStr) return 0;
  const clean = String(tStr).trim().toLowerCase();
  const isPM = clean.includes('pm');
  const isAM = clean.includes('am');
  const timeWithoutAmPm = clean.replace(/[apm\s]/g, '');
  const parts = timeWithoutAmPm.split(':').map(Number);
  let h = parts[0] || 0;
  const m = parts[1] || 0;

  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  
  return h * 60 + m;
}

/**
 * Format time to 12-hour AM/PM string
 */
export function formatTimeRange(startTime: string, endTime: string): string {
  const formatSingle = (t: string) => {
    if (!t) return '';
    const clean = String(t).trim();
    if (clean.toLowerCase().includes('am') || clean.toLowerCase().includes('pm')) {
      return clean.toUpperCase();
    }
    const parts = safeSplit(clean, ':');
    if (parts.length < 2) return clean;
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    if (isNaN(h)) return clean;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${m} ${ampm}`;
  };

  return `${formatSingle(startTime)} - ${formatSingle(endTime)}`;
}

/**
 * Calculates non-overlapping approved overtime for a single date.
 * Strictly avoids double-counting overlapping requests.
 */
export function calculateDayOvertime(requests: OvertimeRequestRecord[]): {
  hoursStr: string;
  minutesStr: string;
  totalMinutes: number;
} {
  // Filter only approved requests
  const approved = requests.filter(r => (r.status || '').toLowerCase() === 'approved');
  if (approved.length === 0) {
    return { hoursStr: '', minutesStr: '', totalMinutes: 0 };
  }

  // Convert each request into an interval [start, end] in minutes
  interface Interval {
    start: number;
    end: number;
    approvedMinutes: number;
  }

  const intervals: Interval[] = [];

  for (const req of approved) {
    const s = parseTimeToMinutes(req.startTime);
    let e = parseTimeToMinutes(req.endTime);
    if (e < s) {
      // Crosses midnight
      e += 24 * 60;
    }
    const rawSpan = Math.max(0, e - s);
    const approvedHours = Number(req.payableHours ?? req.approvedHours ?? req.requestedHours ?? 0);
    const maxApprovedMinutes = approvedHours > 0 ? Math.round(approvedHours * 60) : rawSpan;
    
    // The effective end time for this request caps at the approved duration
    const effectiveSpan = Math.min(rawSpan, maxApprovedMinutes);
    intervals.push({
      start: s,
      end: s + effectiveSpan,
      approvedMinutes: effectiveSpan
    });
  }

  // Sort intervals by start time
  intervals.sort((a, b) => a.start - b.start);

  // Merge overlapping intervals to guarantee no double-counting
  const merged: { start: number; end: number }[] = [];
  for (const interval of intervals) {
    if (merged.length === 0) {
      merged.push({ start: interval.start, end: interval.end });
    } else {
      const last = merged[merged.length - 1];
      if (interval.start <= last.end) {
        // Overlap detected: merge by extending end time
        last.end = Math.max(last.end, interval.end);
      } else {
        merged.push({ start: interval.start, end: interval.end });
      }
    }
  }

  // Sum non-overlapping merged intervals
  let totalNonOverlappingMinutes = 0;
  for (const m of merged) {
    totalNonOverlappingMinutes += Math.max(0, m.end - m.start);
  }

  if (totalNonOverlappingMinutes > 0) {
    const h = Math.floor(totalNonOverlappingMinutes / 60);
    const m = Math.round(totalNonOverlappingMinutes % 60);
    return {
      hoursStr: String(h),
      minutesStr: String(m).padStart(2, '0'),
      totalMinutes: totalNonOverlappingMinutes
    };
  }

  return { hoursStr: '', minutesStr: '', totalMinutes: 0 };
}

/**
 * Calculates monthly overtime totals across all days
 */
export function calculateMonthlyOvertimeTotals(dayTotals: { totalOvertimeMinutes?: number }[]): {
  overtimeHoursStr: string;
  overtimeMinutesStr: string;
  totalOvertimeMinutes: number;
} {
  let totalMin = 0;
  dayTotals.forEach(d => {
    if (d && typeof d.totalOvertimeMinutes === 'number') {
      totalMin += d.totalOvertimeMinutes;
    }
  });

  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);

  return {
    overtimeHoursStr: totalMin > 0 ? String(h) : '0',
    overtimeMinutesStr: totalMin > 0 ? String(m).padStart(2, '0') : '00',
    totalOvertimeMinutes: totalMin
  };
}
