// Client-side cache and high-performance data fetcher for DTR
let cachedEmployees: any[] | null = null;
let cachedHolidays: any[] | null = null;
let cachedEmployeesTime = 0;
let cachedHolidaysTime = 0;
const CACHE_TTL = 30000; // 30 seconds

export interface DTRBootstrapData {
  employees: any[];
  holidays: any[];
  logs: any[];
  status: any;
  schedules: any[];
  period: {
    year: number;
    month: number;
    startDate: string;
    endDate: string;
  };
}

export async function fetchDTRBootstrap(params: {
  employeeId?: string;
  month?: number;
  year?: number;
  campus?: string;
}): Promise<DTRBootstrapData> {
  const query = new URLSearchParams();
  if (params.employeeId) query.set('employeeId', params.employeeId);
  if (params.month) query.set('month', String(params.month));
  if (params.year) query.set('year', String(params.year));
  if (params.campus) query.set('campus', params.campus);

  try {
    const res = await fetch(`/api/dtr/bootstrap?${query.toString()}`);
    if (res.ok) {
      const data: DTRBootstrapData = await res.json();
      if (data.employees && data.employees.length > 0) {
        cachedEmployees = data.employees;
        cachedEmployeesTime = Date.now();
      }
      if (data.holidays && data.holidays.length > 0) {
        cachedHolidays = data.holidays;
        cachedHolidaysTime = Date.now();
      }
      return data;
    }
  } catch (err) {
    console.error('Failed to fetch bootstrap DTR data:', err);
  }

  // Fallback to empty structure
  return {
    employees: cachedEmployees || [],
    holidays: cachedHolidays || [],
    logs: [],
    status: null,
    schedules: [],
    period: {
      year: params.year || new Date().getFullYear(),
      month: params.month || (new Date().getMonth() + 1),
      startDate: '',
      endDate: ''
    }
  };
}

export async function getCachedEmployees(): Promise<any[]> {
  if (cachedEmployees && (Date.now() - cachedEmployeesTime < CACHE_TTL)) {
    return cachedEmployees;
  }
  try {
    const res = await fetch('/api/employees');
    const data = await res.json();
    cachedEmployees = Array.isArray(data) ? data : [];
    cachedEmployeesTime = Date.now();
    return cachedEmployees;
  } catch {
    return cachedEmployees || [];
  }
}

export async function getCachedHolidays(): Promise<any[]> {
  if (cachedHolidays && (Date.now() - cachedHolidaysTime < CACHE_TTL)) {
    return cachedHolidays;
  }
  try {
    const res = await fetch('/api/holidays');
    const data = await res.json();
    cachedHolidays = Array.isArray(data) ? data : [];
    cachedHolidaysTime = Date.now();
    return cachedHolidays;
  } catch {
    return cachedHolidays || [];
  }
}

export function invalidateDTRCache() {
  cachedEmployees = null;
  cachedHolidays = null;
  cachedEmployeesTime = 0;
  cachedHolidaysTime = 0;
}
