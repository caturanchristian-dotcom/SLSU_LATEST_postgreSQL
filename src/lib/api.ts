const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  try {
    const saved = localStorage.getItem('payroll_user');
    if (saved) {
      const u = JSON.parse(saved);
      return {
        'x-user-email': u.email || '',
        'x-user-id': u.id || '',
        'x-user-role': u.role || '',
        'x-user-campus': u.campus || '',
      };
    }
  } catch (e) {
    console.error(e);
  }
  return {};
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const authHeaders = getAuthHeaders();
  const headers = {
    ...options.headers,
    ...authHeaders,
  };
  return fetch(url, { ...options, headers });
}

async function handleResponse(res: Response) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return {};
  }
  
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong') as any;
    err.assignedCampus = data.assignedCampus;
    err.code = data.code;
    throw err;
  }
  return data;
}

export function notifyRealtime(eventNames: string | string[], detail?: any) {
  try {
    const names = Array.isArray(eventNames) ? eventNames : [eventNames];
    names.forEach(name => {
      window.dispatchEvent(new CustomEvent(`realtime-${name}`, { detail }));
    });
  } catch (e) {
    console.error('Error dispatching realtime event', e);
  }
}

export const api = {
  auth: {
    login: async (email: string, password: string, campus?: string) => {
      const res = await fetchWithAuth(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, campus }),
      });
      return handleResponse(res);
    },
    googleLogin: async (payload: {
      email: string;
      displayName?: string;
      profileImage?: string;
      campus?: string;
      supabaseToken?: string;
      supabaseUser?: any;
    }) => {
      const res = await fetchWithAuth(`${API_BASE}/auth/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return handleResponse(res);
    },
  },
  employees: {
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/employees`);
      return handleResponse(res);
    },
    create: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    bulkCreate: async (employees: any[]) => {
      const res = await fetchWithAuth(`${API_BASE}/employees/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees }),
      });
      return handleResponse(res);
    },
    update: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/employees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    delete: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/employees/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
    deleteAll: async () => {
      const res = await fetchWithAuth(`${API_BASE}/employees/delete/all`, { method: 'DELETE' });
      return handleResponse(res);
    },
    getPayrollHistory: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/employees/${id}/payroll-history`);
      return handleResponse(res);
    },
    getDeductionHistory: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/employees/${id}/deduction-history`);
      return handleResponse(res);
    },
    listCategories: async () => {
      const res = await fetchWithAuth(`${API_BASE}/employee-categories`);
      return handleResponse(res);
    },
    createCategory: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/employee-categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    updateCategory: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/employee-categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    deleteCategory: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/employee-categories/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
    listPositions: async () => {
      const res = await fetchWithAuth(`${API_BASE}/employee-positions`);
      return handleResponse(res);
    },
    createPosition: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/employee-positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    updatePosition: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/employee-positions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    deletePosition: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/employee-positions/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
  },
  schedules: {
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/schedules`);
      return handleResponse(res);
    },
    getByEmployee: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/schedules/employee/${id}`);
      return handleResponse(res);
    },
    create: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    update: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/schedules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    delete: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/schedules/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
  },
  deductions: {
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/deductions`);
      return handleResponse(res);
    },
    create: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/deductions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    update: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/deductions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    delete: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/deductions/${id}`, { method: 'DELETE' });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    listTypes: async () => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-types`);
      return handleResponse(res);
    },
    createType: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    updateType: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-types/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    deleteType: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-types/${id}`, { method: 'DELETE' });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    importBulk: async (data: any[]) => {
      const res = await fetchWithAuth(`${API_BASE}/deductions/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    deleteByEmployee: async (employeeId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/deductions/employee/${employeeId}`, { method: 'DELETE' });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    clearAll: async () => {
      const res = await fetchWithAuth(`${API_BASE}/deductions`, { method: 'DELETE' });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
  },
  deductionRecords: {
    listRecords: async (params?: { year?: number; month?: number; search?: string }) => {
      const queryParams = new URLSearchParams();
      if (params?.year) queryParams.set('year', params.year.toString());
      if (params?.month) queryParams.set('month', params.month.toString());
      if (params?.search) queryParams.set('search', params.search);
      const url = `${API_BASE}/deduction-records${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const res = await fetchWithAuth(url);
      return handleResponse(res);
    },
    getRecord: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-records/${id}`);
      return handleResponse(res);
    },
    createRecord: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    saveCurrent: async (data?: any) => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-records/save-current`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {}),
      });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    updateRecord: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-records/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    deleteRecord: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-records/${id}`, { method: 'DELETE' });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    clearAllRecords: async () => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-records`, { method: 'DELETE' });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
  },
  payroll: {
    listCycles: async () => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles`);
      return handleResponse(res);
    },
    createCycle: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    getEntries: async (cycleId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/entries`);
      return handleResponse(res);
    },
    updateEntry: async (entryId: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-entries/${entryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    deleteEntry: async (entryId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-entries/${entryId}`, { method: 'DELETE' });
      return handleResponse(res);
    },
    addEmployee: async (cycleId: string, employeeId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/add-employee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId }),
      });
      return handleResponse(res);
    },
    process: async (cycleId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/process`, { method: 'POST' });
      return handleResponse(res);
    },
    revert: async (cycleId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/revert`, { method: 'POST' });
      return handleResponse(res);
    },
    disburse: async (cycleId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/disburse`, { method: 'POST' });
      return handleResponse(res);
    },
    deleteCycle: async (cycleId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}`, { method: 'DELETE' });
      return handleResponse(res);
    },
    populate: async (cycleId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/populate`, { method: 'POST' });
      return handleResponse(res);
    },
    getMyPayroll: async (email: string) => {
      const res = await fetchWithAuth(`${API_BASE}/my-payroll?email=${encodeURIComponent(email)}`);
      return handleResponse(res);
    },
    getMySmsLogs: async (email: string) => {
      const res = await fetchWithAuth(`${API_BASE}/my-sms-logs?email=${encodeURIComponent(email)}`);
      return handleResponse(res);
    },
    approve: async (cycleId: string, options?: { approvedBy?: string; userRole?: string; userId?: string; userEmail?: string; userCampus?: string }) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {})
      });
      return handleResponse(res);
    },
    reject: async (cycleId: string, options?: { rejectedBy?: string; userRole?: string; userId?: string; userEmail?: string; userCampus?: string }) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {})
      });
      return handleResponse(res);
    },
    assignAccountant: async (cycleId: string, data: { managedBy?: string; managedByName?: string; campus?: string }) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return handleResponse(res);
    },
    // Payroll Records (By Year & By Month)
    listRecords: async (params?: { year?: number; month?: number; search?: string }) => {
      const queryParams = new URLSearchParams();
      if (params?.year) queryParams.set('year', params.year.toString());
      if (params?.month) queryParams.set('month', params.month.toString());
      if (params?.search) queryParams.set('search', params.search);
      const url = `${API_BASE}/payroll-records${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const res = await fetchWithAuth(url);
      return handleResponse(res);
    },
    getRecord: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-records/${id}`);
      return handleResponse(res);
    },
    createRecord: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    saveFromCycle: async (cycleId: string, data?: any) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-records/save-from-cycle/${cycleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {}),
      });
      return handleResponse(res);
    },
    updateRecord: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-records/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    deleteRecord: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-records/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
    validateEntry: async (entryId: string, isValidated: boolean) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-entries/${entryId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isValidated }),
      });
      return handleResponse(res);
    },
    importDeductions: async (cycleId: string, updates: any[]) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/import-deductions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      return handleResponse(res);
    },
  },
  history: {
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/history`);
      return handleResponse(res);
    },
  },
  departments: {
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/departments`);
      return handleResponse(res);
    },
    create: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    update: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/departments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    delete: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/departments/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
    listHeads: async () => {
      const res = await fetchWithAuth(`${API_BASE}/department-heads`);
      return handleResponse(res);
    },
  },
  subjects: {
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/subjects`);
      return handleResponse(res);
    },
    create: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    update: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/subjects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    delete: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/subjects/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
  },
  users: {
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/users`);
      return handleResponse(res);
    },
    create: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    update: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    delete: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/users/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
    syncSupabase: async () => {
      const res = await fetchWithAuth(`${API_BASE}/users/sync-supabase`, {
        method: 'POST',
      });
      return handleResponse(res);
    },
    getSupabaseStatus: async () => {
      const res = await fetchWithAuth(`${API_BASE}/users/supabase-status`);
      return handleResponse(res);
    },
  },
  profile: {
    get: async (email: string) => {
      const res = await fetchWithAuth(`${API_BASE}/profile?email=${encodeURIComponent(email)}`);
      return handleResponse(res);
    },
    update: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
  },
  reports: {
    getFinancial: async (params?: { year?: number | string; month?: number | string; campus?: string; category?: string; status?: string }) => {
      const queryParams = new URLSearchParams();
      if (params?.year && params.year !== 'all') queryParams.set('year', params.year.toString());
      if (params?.month && params.month !== 'all') queryParams.set('month', params.month.toString());
      if (params?.campus && params.campus !== 'all' && params.campus !== 'All Campuses') queryParams.set('campus', params.campus);
      if (params?.category && params.category !== 'all' && params.category !== 'All Categories') queryParams.set('category', params.category);
      if (params?.status && params.status !== 'all' && params.status !== 'All Statuses') queryParams.set('status', params.status);
      const url = `${API_BASE}/reports/financial${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const res = await fetchWithAuth(url);
      return handleResponse(res);
    },
  },
  audit: {
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/audit-logs`);
      return handleResponse(res);
    },
  },
};
