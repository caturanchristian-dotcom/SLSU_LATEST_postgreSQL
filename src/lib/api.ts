// ============================================================================
// FRONTEND API CLIENT GATEWAY (HTTP Client, Auth Headers, SSE Events & Services)
// ============================================================================

// Base API route prefix for all backend endpoints
const API_BASE = '/api';

// ============================================================================
// Helper Function: Retrieve Current Authenticated User Session Headers
// Reads stored session from browser localStorage to populate request headers
// ============================================================================
function getAuthHeaders(): Record<string, string> {
  try {
    // Retrieve stored user JSON string from localStorage
    const saved = localStorage.getItem('payroll_user');
    // If a saved session exists, parse JSON and map authentication headers
    if (saved) {
      const u = JSON.parse(saved);
      return {
        'x-user-email': u.email || '',       // User's email address for audit and access logging
        'x-user-id': u.id || '',             // User's unique database identifier
        'x-user-role': u.role || '',         // Role-based access control role (admin, accountant, employee, etc.)
        'x-user-campus': u.campus || '',     // Assigned SLSU campus (e.g. Hinunangan Campus, Sogod, etc.)
      };
    }
  } catch (e) {
    // Log parsing errors gracefully to console
    console.error('Failed to parse authenticated user headers from localStorage:', e);
  }
  // Return empty headers object if no active session is found
  return {};
}

// ============================================================================
// Helper Function: Authenticated Fetch Wrapper
// Automatically injects authentication headers and custom options to fetch calls
// ============================================================================
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  // Obtain session headers from localStorage
  const authHeaders = getAuthHeaders();
  // Merge user-specified headers with auto-injected auth headers
  const headers = {
    ...options.headers,
    ...authHeaders,
  };
  // Execute native HTTP fetch call with combined options
  return fetch(url, { ...options, headers });
}

// ============================================================================
// Helper Function: Unified HTTP Response Handler
// Parses JSON responses, handles errors, and extracts detailed error metadata
// ============================================================================
async function handleResponse(res: Response) {
  // Read raw response text from the server
  const text = await res.text();
  let data;
  try {
    // Safely parse JSON body if text is present
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    // If response was an HTTP error and not valid JSON, throw status error
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    // If successful but empty body, return empty object
    return {};
  }
  
  // If response HTTP status indicates failure (4xx or 5xx)
  if (!res.ok) {
    // Create new Error instance with server message or fallback
    const err = new Error(data.error || 'Something went wrong') as any;
    // Attach additional metadata such as campus assignment or error codes
    err.assignedCampus = data.assignedCampus;
    err.code = data.code;
    throw err;
  }
  // Return parsed JSON payload
  return data;
}

// ============================================================================
// Helper Function: Real-Time Custom Event Dispatcher
// Dispatches browser-level window events to notify UI components of changes
// ============================================================================
export function notifyRealtime(eventNames: string | string[], detail?: any) {
  try {
    // Normalize input to array of event names
    const names = Array.isArray(eventNames) ? eventNames : [eventNames];
    // Dispatch custom DOM event for each event channel name
    names.forEach(name => {
      window.dispatchEvent(new CustomEvent(`realtime-${name}`, { detail }));
    });
  } catch (e) {
    // Log unexpected event dispatch errors
    console.error('Error dispatching realtime event:', e);
  }
}

// ============================================================================
// MAIN API CLIENT OBJECT (Grouped by Functional Modules)
// ============================================================================
export const api = {
  // --------------------------------------------------------------------------
  // 1. AUTHENTICATION SERVICES
  // --------------------------------------------------------------------------
  auth: {
    // Sign in with email, password, and optional campus verification
    login: async (email: string, password: string, campus?: string) => {
      const res = await fetchWithAuth(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, campus }),
      });
      return handleResponse(res);
    },
    // Sign in using Google Workspace OAuth credentials
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

  // --------------------------------------------------------------------------
  // 2. EMPLOYEE MANAGEMENT SERVICES
  // --------------------------------------------------------------------------
  employees: {
    // Retrieve complete list of employees
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/employees`);
      return handleResponse(res);
    },
    // Create a new employee record
    create: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Bulk create or import multiple employee records at once
    bulkCreate: async (employees: any[]) => {
      const res = await fetchWithAuth(`${API_BASE}/employees/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees }),
      });
      return handleResponse(res);
    },
    // Update an existing employee profile by ID
    update: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/employees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Delete a specific employee record
    delete: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/employees/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
    // Delete all employee records (cleans database)
    deleteAll: async () => {
      const res = await fetchWithAuth(`${API_BASE}/employees/delete/all`, { method: 'DELETE' });
      return handleResponse(res);
    },
    // Fetch historical payroll payslips and records for an employee
    getPayrollHistory: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/employees/${id}/payroll-history`);
      return handleResponse(res);
    },
    // Fetch historical deduction entries for an employee
    getDeductionHistory: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/employees/${id}/deduction-history`);
      return handleResponse(res);
    },
    // List all employee categories (Faculty, Staff, Admin, Job Order, etc.)
    listCategories: async () => {
      const res = await fetchWithAuth(`${API_BASE}/employee-categories`);
      return handleResponse(res);
    },
    // Create a new employee classification category
    createCategory: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/employee-categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Update an existing employee category
    updateCategory: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/employee-categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Delete an employee classification category
    deleteCategory: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/employee-categories/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
    // List all position titles and salary grades
    listPositions: async () => {
      const res = await fetchWithAuth(`${API_BASE}/employee-positions`);
      return handleResponse(res);
    },
    // Create a new employee position title
    createPosition: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/employee-positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Update an existing position definition
    updatePosition: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/employee-positions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Delete an employee position definition
    deletePosition: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/employee-positions/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
  },

  // --------------------------------------------------------------------------
  // 3. WORK SCHEDULE & SHIFT SERVICES
  // --------------------------------------------------------------------------
  schedules: {
    // List all configured work schedules
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/schedules`);
      return handleResponse(res);
    },
    // Get schedule assigned to a specific employee
    getByEmployee: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/schedules/employee/${id}`);
      return handleResponse(res);
    },
    // Create a new work shift / schedule template
    create: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Update an existing schedule template
    update: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/schedules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Delete a work schedule
    delete: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/schedules/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
  },

  // --------------------------------------------------------------------------
  // 4. DEDUCTIONS & MANDATORY CONTRIBUTIONS SERVICES
  // --------------------------------------------------------------------------
  deductions: {
    // Retrieve all active employee deduction entries
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/deductions`);
      return handleResponse(res);
    },
    // Create a new deduction entry (GSIS, Pag-IBIG, PhilHealth, Loans, etc.)
    create: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/deductions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await handleResponse(res);
      // Notify application of deduction and payroll state changes
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    // Update an existing deduction entry
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
    // Delete an individual deduction item
    delete: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/deductions/${id}`, { method: 'DELETE' });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    // List all predefined deduction types (Mandatory vs Voluntary)
    listTypes: async () => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-types`);
      return handleResponse(res);
    },
    // Create a new deduction type definition
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
    // Update an existing deduction type
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
    // Delete a deduction type definition
    deleteType: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-types/${id}`, { method: 'DELETE' });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    // Bulk import deductions matrix from CSV or spreadsheet
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
    // Delete all deductions for a given employee
    deleteByEmployee: async (employeeId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/deductions/employee/${employeeId}`, { method: 'DELETE' });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    // Clear all deductions across the entire system
    clearAll: async () => {
      const res = await fetchWithAuth(`${API_BASE}/deductions`, { method: 'DELETE' });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
  },

  // --------------------------------------------------------------------------
  // 5. HISTORICAL DEDUCTION RECORDS ARCHIVE
  // --------------------------------------------------------------------------
  deductionRecords: {
    // List archived deduction records filtered by year, month, or search query
    listRecords: async (params?: { year?: number; month?: number; search?: string }) => {
      const queryParams = new URLSearchParams();
      if (params?.year) queryParams.set('year', params.year.toString());
      if (params?.month) queryParams.set('month', params.month.toString());
      if (params?.search) queryParams.set('search', params.search);
      const url = `${API_BASE}/deduction-records${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const res = await fetchWithAuth(url);
      return handleResponse(res);
    },
    // Retrieve single archived deduction record by ID
    getRecord: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-records/${id}`);
      return handleResponse(res);
    },
    // Create new archived deduction record entry
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
    // Snapshot and save current live deductions into permanent records archive
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
    // Update an archived deduction record
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
    // Delete an archived deduction record
    deleteRecord: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-records/${id}`, { method: 'DELETE' });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
    // Purge all archived deduction records
    clearAllRecords: async () => {
      const res = await fetchWithAuth(`${API_BASE}/deduction-records`, { method: 'DELETE' });
      const result = await handleResponse(res);
      notifyRealtime(['deductions_changed', 'payroll_changed'], result);
      return result;
    },
  },

  // --------------------------------------------------------------------------
  // 6. PAYROLL CYCLES & COMPUTATION SERVICES
  // --------------------------------------------------------------------------
  payroll: {
    // List all payroll processing cycles
    listCycles: async () => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles`);
      return handleResponse(res);
    },
    // Create a new payroll cycle (1st Half, 2nd Half, Monthly, or 13th Month)
    createCycle: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Update a payroll cycle's category filter
    updateCycleCategoryFilter: async (cycleId: string, categoryFilter: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/category-filter`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryFilter }),
      });
      return handleResponse(res);
    },
    // Update a payroll cycle's Salaries & Wages column label
    updateSalariesLabel: async (cycleId: string, salariesLabel: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/salaries-label`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salariesLabel }),
      });
      return handleResponse(res);
    },
    // Update a payroll cycle's totals directly
    updateCycleTotals: async (cycleId: string, totals: { totalGross: number; totalDeductions: number; totalNet: number }) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/totals`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(totals),
      });
      return handleResponse(res);
    },
    // Retrieve all employee calculation line entries for a payroll cycle
    getEntries: async (cycleId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/entries`);
      return handleResponse(res);
    },
    // Update individual payroll entry calculations (overtime, bonuses, deductions)
    updateEntry: async (entryId: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-entries/${entryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Delete a line entry from a payroll cycle
    deleteEntry: async (entryId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-entries/${entryId}`, { method: 'DELETE' });
      return handleResponse(res);
    },
    // Add an employee to an existing payroll cycle
    addEmployee: async (cycleId: string, employeeId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/add-employee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId }),
      });
      return handleResponse(res);
    },
    // Fetch available active employees eligible for enrollment in a cycle
    getAvailableEmployees: async (cycleId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/available-employees`);
      return handleResponse(res);
    },
    // Compute net salary, taxes, allowances, and finalize cycle calculations
    process: async (cycleId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/process`, { method: 'POST' });
      return handleResponse(res);
    },
    // Revert a processed payroll cycle back to draft state
    revert: async (cycleId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/revert`, { method: 'POST' });
      return handleResponse(res);
    },
    // Disburse payroll funds and mark status as disbursed / paid
    disburse: async (cycleId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/disburse`, { method: 'POST' });
      return handleResponse(res);
    },
    // Delete an entire payroll cycle and associated line entries
    deleteCycle: async (cycleId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}`, { method: 'DELETE' });
      return handleResponse(res);
    },
    // Auto-populate cycle with active employees and apply standard formulas
    populate: async (cycleId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/populate`, { method: 'POST' });
      return handleResponse(res);
    },
    // Fetch personal payslips for the logged-in employee by email
    getMyPayroll: async (email: string) => {
      const res = await fetchWithAuth(`${API_BASE}/my-payroll?email=${encodeURIComponent(email)}`);
      return handleResponse(res);
    },
    // Fetch SMS payslip transmission notifications for the logged-in employee
    getMySmsLogs: async (email: string) => {
      const res = await fetchWithAuth(`${API_BASE}/my-sms-logs?email=${encodeURIComponent(email)}`);
      return handleResponse(res);
    },
    // Approve payroll cycle through hierarchical approval workflow
    approve: async (cycleId: string, options?: { approvedBy?: string; userRole?: string; userId?: string; userEmail?: string; userCampus?: string }) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {})
      });
      return handleResponse(res);
    },
    // Reject payroll cycle with comments for revision
    reject: async (cycleId: string, options?: { rejectedBy?: string; userRole?: string; userId?: string; userEmail?: string; userCampus?: string }) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {})
      });
      return handleResponse(res);
    },
    // Assign specific accountant or officer-in-charge to manage payroll cycle
    assignAccountant: async (cycleId: string, data: { managedBy?: string; managedByName?: string; campus?: string }) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return handleResponse(res);
    },
    // Synchronize DTR attendance records (tardiness, undertime, absences) into payroll cycle
    syncDtr: async (cycleId: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/sync-dtr`, { method: 'POST' });
      return handleResponse(res);
    },
    // List historical payroll records filtered by year, month, or search query
    listRecords: async (params?: { year?: number; month?: number; search?: string }) => {
      const queryParams = new URLSearchParams();
      if (params?.year) queryParams.set('year', params.year.toString());
      if (params?.month) queryParams.set('month', params.month.toString());
      if (params?.search) queryParams.set('search', params.search);
      const url = `${API_BASE}/payroll-records${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const res = await fetchWithAuth(url);
      return handleResponse(res);
    },
    // Retrieve single payroll record by ID
    getRecord: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-records/${id}`);
      return handleResponse(res);
    },
    // Create new payroll record entry
    createRecord: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Snapshot payroll cycle state into permanent historical records database
    saveFromCycle: async (cycleId: string, data?: any) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-records/save-from-cycle/${cycleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {}),
      });
      return handleResponse(res);
    },
    // Update existing payroll record
    updateRecord: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-records/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Delete payroll record entry
    deleteRecord: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-records/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
    // Sync all disbursed cycles to payroll records
    syncAllRecords: async () => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-records/sync-all`, { method: 'POST' });
      return handleResponse(res);
    },
    // Mark payroll entry as validated / reviewed
    validateEntry: async (entryId: string, isValidated: boolean) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-entries/${entryId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isValidated }),
      });
      return handleResponse(res);
    },
    // Import updated deduction values into payroll cycle entries
    importDeductions: async (cycleId: string, updates: any[]) => {
      const res = await fetchWithAuth(`${API_BASE}/payroll-cycles/${cycleId}/import-deductions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      return handleResponse(res);
    },
  },

  // --------------------------------------------------------------------------
  // 7. AUDIT & ACTION HISTORY SERVICES
  // --------------------------------------------------------------------------
  history: {
    // List system history and operation events
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/history`);
      return handleResponse(res);
    },
  },

  // --------------------------------------------------------------------------
  // 8. DEPARTMENTS & ORGANIZATIONAL UNITS
  // --------------------------------------------------------------------------
  departments: {
    // List all academic and administrative departments
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/departments`);
      return handleResponse(res);
    },
    // Create a new department
    create: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Update an existing department
    update: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/departments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Delete a department
    delete: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/departments/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
    // List appointed department heads and deans
    listHeads: async () => {
      const res = await fetchWithAuth(`${API_BASE}/department-heads`);
      return handleResponse(res);
    },
  },

  // --------------------------------------------------------------------------
  // 9. TEACHING SUBJECTS & ACADEMIC COURSES
  // --------------------------------------------------------------------------
  subjects: {
    // List all teaching subjects and course codes
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/subjects`);
      return handleResponse(res);
    },
    // Create a new subject code and teaching load credit
    create: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Update subject details
    update: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/subjects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Delete a subject
    delete: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/subjects/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
  },

  // --------------------------------------------------------------------------
  // 10. SYSTEM USERS & ROLE PERMISSIONS
  // --------------------------------------------------------------------------
  users: {
    // List all user accounts in the system
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/users`);
      return handleResponse(res);
    },
    // Create a new user account
    create: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Update user account roles, permissions, or profile details
    update: async (id: string, data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Delete a user account
    delete: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/users/${id}`, { method: 'DELETE' });
      return handleResponse(res);
    },
    // Synchronize all local users to Supabase Auth cloud directory
    syncSupabase: async () => {
      const res = await fetchWithAuth(`${API_BASE}/users/sync-supabase`, {
        method: 'POST',
      });
      return handleResponse(res);
    },
    // Query Supabase synchronization status and metrics
    getSupabaseStatus: async () => {
      const res = await fetchWithAuth(`${API_BASE}/users/supabase-status`);
      return handleResponse(res);
    },
  },

  // --------------------------------------------------------------------------
  // 11. USER PROFILE MANAGEMENT
  // --------------------------------------------------------------------------
  profile: {
    // Fetch profile details for a given email address
    get: async (email: string) => {
      const res = await fetchWithAuth(`${API_BASE}/profile?email=${encodeURIComponent(email)}`);
      return handleResponse(res);
    },
    // Update personal user profile settings
    update: async (data: any) => {
      const res = await fetchWithAuth(`${API_BASE}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
  },

  // --------------------------------------------------------------------------
  // 12. FINANCIAL & COMPLIANCE REPORTS
  // --------------------------------------------------------------------------
  reports: {
    // Fetch financial metrics and payroll summaries filtered by year, month, campus, category, or status
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

  // --------------------------------------------------------------------------
  // 13. AUDIT TRAIL LOGS
  // --------------------------------------------------------------------------
  audit: {
    // Retrieve system audit trail logs for security and compliance audits
    list: async () => {
      const res = await fetchWithAuth(`${API_BASE}/audit-logs`);
      return handleResponse(res);
    },
  },

  // --------------------------------------------------------------------------
  // 14. CLOUD STORAGE (Supabase Storage & Image Management)
  // --------------------------------------------------------------------------
  storage: {
    // Upload image to Supabase Storage bucket with optional auto-cleanup of previous image
    uploadImage: async (image: string, filename?: string, folder?: string, bucket?: string, oldImage?: string) => {
      const res = await fetchWithAuth(`${API_BASE}/storage/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, filename, folder, bucket, oldImage }),
      });
      return handleResponse(res);
    },
    // Delete image file from Supabase Storage bucket by public URL or storage path
    deleteImage: async (image: string, bucket?: string) => {
      const res = await fetchWithAuth(`${API_BASE}/storage/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, bucket }),
      });
      return handleResponse(res);
    },
    // Check Supabase Storage bucket health and connectivity status
    getStatus: async () => {
      const res = await fetchWithAuth(`${API_BASE}/storage/status`);
      return handleResponse(res);
    },
    // Ensure public storage bucket exists in Supabase
    ensureBucket: async (bucket?: string) => {
      const res = await fetchWithAuth(`${API_BASE}/storage/ensure-bucket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket }),
      });
      return handleResponse(res);
    },
    // Migrate legacy base64 images from database tables to Supabase Storage
    migrateAll: async (bucket?: string) => {
      const res = await fetchWithAuth(`${API_BASE}/storage/migrate-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket }),
      });
      return handleResponse(res);
    },
  },

  // --------------------------------------------------------------------------
  // 15. OVERTIME REQUESTS & APPROVALS
  // --------------------------------------------------------------------------
  overtime: {
    // List overtime requests with optional filters
    list: async (params?: {
      status?: string;
      employeeId?: string;
      startDate?: string;
      endDate?: string;
      department?: string;
      campus?: string;
      search?: string;
      page?: number;
      limit?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            qs.append(k, String(v));
          }
        });
      }
      const res = await fetchWithAuth(`${API_BASE}/overtime-requests?${qs.toString()}`);
      return handleResponse(res);
    },
    // Get single overtime request details including DTR record on that date
    get: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/overtime-requests/${id}`);
      return handleResponse(res);
    },
    // Get overtime statistics summary
    getSummary: async (employeeId?: string) => {
      const qs = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
      const res = await fetchWithAuth(`${API_BASE}/overtime-requests/summary${qs}`);
      return handleResponse(res);
    },
    // Submit new overtime request
    create: async (data: {
      employeeId: string;
      overtimeDate: string;
      startTime: string;
      endTime: string;
      requestedHours?: number;
      reason: string;
      documentUrl?: string;
    }) => {
      const res = await fetchWithAuth(`${API_BASE}/overtime-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Update pending overtime request
    update: async (id: string, data: {
      overtimeDate?: string;
      startTime?: string;
      endTime?: string;
      reason?: string;
      documentUrl?: string;
    }) => {
      const res = await fetchWithAuth(`${API_BASE}/overtime-requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Approve overtime request (Admin / Supervisor)
    approve: async (id: string, data?: {
      approverId?: string;
      approverName?: string;
      approvalRemarks?: string;
      approvedHours?: number;
    }) => {
      const res = await fetchWithAuth(`${API_BASE}/overtime-requests/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {}),
      });
      return handleResponse(res);
    },
    // Batch approve multiple overtime requests
    batchApprove: async (data: {
      ids: string[];
      approverId?: string;
      approverName?: string;
      approvalRemarks?: string;
    }) => {
      const res = await fetchWithAuth(`${API_BASE}/overtime-requests/batch-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Reject overtime request (Admin / Supervisor)
    reject: async (id: string, data?: {
      approverId?: string;
      approverName?: string;
      approvalRemarks?: string;
      rejectionReason?: string;
    }) => {
      const res = await fetchWithAuth(`${API_BASE}/overtime-requests/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {}),
      });
      return handleResponse(res);
    },
    // Batch reject multiple overtime requests
    batchReject: async (data: {
      ids: string[];
      approverId?: string;
      approverName?: string;
      rejectionReason?: string;
    }) => {
      const res = await fetchWithAuth(`${API_BASE}/overtime-requests/batch-reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    // Cancel pending overtime request (Employee)
    cancel: async (id: string, reason?: string) => {
      const res = await fetchWithAuth(`${API_BASE}/overtime-requests/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      return handleResponse(res);
    },
    // Delete overtime request record (Admin)
    delete: async (id: string) => {
      const res = await fetchWithAuth(`${API_BASE}/overtime-requests/${id}`, {
        method: 'DELETE',
      });
      return handleResponse(res);
    },
  },
};

