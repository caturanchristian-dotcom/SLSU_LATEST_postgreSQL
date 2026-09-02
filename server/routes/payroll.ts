import { Router } from "express";
import { db, logAudit, MONTH_NAMES_LIST } from "../db/schema.js";
import { calculateNetSalary, syncPayrollCycleToRecord, syncAllCyclesToRecords, syncPayrollDeductionsToDeductionsTable } from "../services/payrollCalculator.js";

export const payrollRouter = Router();

// Helper to populate initial employees and calculate calculations
export async function populateCycleEmployees(cycleId: string) {
  try {
    const cycle = await db.prepare("SELECT * FROM payroll_cycles WHERE id = ?").get(cycleId) as any;
    if (!cycle) return;

    const existingEntries = await db.prepare("SELECT employeeId FROM payroll_entries WHERE cycleId = ?").all(cycleId) as any[];
    const existingEmpIds = new Set(existingEntries.map(e => e.employeeId));

    let empQuery = "SELECT * FROM employees WHERE status = 'active' OR status IS NULL";
    const empParams: any[] = [];

    // Filter category
    const catFilter = (cycle.categoryFilter || 'all').toLowerCase();
    if (catFilter === 'faculty-staff' || catFilter === 'faculty & staff' || catFilter === 'faculty_staff') {
      empQuery += " AND (UPPER(category) LIKE '%FACULTY%' OR UPPER(category) LIKE '%STAFF%')";
    } else if (catFilter === 'visiting-instructor' || catFilter === 'visiting instructor' || catFilter === 'visiting') {
      empQuery += " AND (UPPER(category) LIKE '%VISITING%' OR UPPER(category) LIKE '%PART-TIME%' OR UPPER(category) LIKE '%LECTURER%')";
    } else if (catFilter === 'job-order' || catFilter === 'job order' || catFilter === 'jo') {
      empQuery += " AND (UPPER(category) LIKE '%JOB ORDER%' OR UPPER(category) LIKE '%JOB_ORDER%' OR UPPER(category) LIKE '%JO%')";
    } else if (catFilter !== 'all') {
      empQuery += " AND (category = ? OR UPPER(category) = UPPER(?) OR category LIKE ?)";
      empParams.push(cycle.categoryFilter, cycle.categoryFilter, `%${cycle.categoryFilter}%`);
    }

    // Filter campus if specified
    if (cycle.campus && cycle.campus !== 'All Campuses') {
      const campusBase = cycle.campus.replace(/Campus/i, '').trim();
      empQuery += " AND (campus = ? OR campus LIKE ? OR campus IS NULL OR campus = '')";
      empParams.push(cycle.campus, `%${campusBase}%`);
    }

    let matchingEmployees = await db.prepare(empQuery).all(...empParams) as any[];

    // If no employees matched the strict campus filter, fallback to all active employees in that category
    if (matchingEmployees.length === 0 && cycle.campus && cycle.campus !== 'All Campuses') {
      let fallbackQuery = "SELECT * FROM employees WHERE status = 'active' OR status IS NULL";
      const fallbackParams: any[] = [];
      if (catFilter === 'faculty-staff' || catFilter === 'faculty & staff' || catFilter === 'faculty_staff') {
        fallbackQuery += " AND (UPPER(category) LIKE '%FACULTY%' OR UPPER(category) LIKE '%STAFF%')";
      } else if (catFilter === 'visiting-instructor' || catFilter === 'visiting instructor' || catFilter === 'visiting') {
        fallbackQuery += " AND (UPPER(category) LIKE '%VISITING%' OR UPPER(category) LIKE '%PART-TIME%' OR UPPER(category) LIKE '%LECTURER%')";
      } else if (catFilter === 'job-order' || catFilter === 'job order' || catFilter === 'jo') {
        fallbackQuery += " AND (UPPER(category) LIKE '%JOB ORDER%' OR UPPER(category) LIKE '%JOB_ORDER%' OR UPPER(category) LIKE '%JO%')";
      } else if (catFilter !== 'all') {
        fallbackQuery += " AND (category = ? OR UPPER(category) = UPPER(?) OR category LIKE ?)";
        fallbackParams.push(cycle.categoryFilter, cycle.categoryFilter, `%${cycle.categoryFilter}%`);
      }
      matchingEmployees = await db.prepare(fallbackQuery).all(...fallbackParams) as any[];
    }

    // If still empty, fallback to all active employees
    if (matchingEmployees.length === 0) {
      matchingEmployees = await db.prepare("SELECT * FROM employees WHERE status = 'active' OR status IS NULL").all() as any[];
    }

    for (const emp of matchingEmployees) {
      if (existingEmpIds.has(emp.id)) continue;
      const entryId = `entry-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const empName = `${emp.lastName ? emp.lastName + ', ' : ''}${emp.firstName || ''} ${emp.mi ? emp.mi + '.' : ''}`.trim();
      const isSemi = cycle.type === 'semi-monthly';
      const basicPay = isSemi ? (Number(emp.basicSalary || 0) / 2) : Number(emp.basicSalary || 0);

      await db.prepare(`
        INSERT INTO payroll_entries (id, cycleId, employeeId, employeeName, basicPay, grossPay, netPay, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(entryId, cycleId, emp.id, empName, basicPay, basicPay, basicPay);
    }

    // Calculate salary, deductions, and DTR for the cycle safely
    try {
      await calculateNetSalary(cycleId);
    } catch (calcErr) {
      console.warn(`[Payroll] Calculation error during populate for cycle ${cycleId}:`, calcErr);
    }
  } catch (err) {
    console.error(`[Payroll] Error in populateCycleEmployees(${cycleId}):`, err);
  }
}

// Payroll Cycles
payrollRouter.get("/payroll-cycles", async (req: any, res: any) => {
  try {
    const userRole = req.headers['x-user-role'] || req.headers['user-role'];
    const userCampus = req.headers['x-user-campus'] || req.headers['user-campus'];

    let query = "SELECT * FROM payroll_cycles";
    let params: any[] = [];

    if (userRole === 'accountant' && userCampus && userCampus !== 'All Campuses') {
      const campusBase = String(userCampus).replace(/Campus/i, '').trim();
      query += " WHERE (campus = ? OR campus LIKE ? OR campus IS NULL OR campus = '' OR campus = 'All Campuses')";
      params.push(userCampus, `%${campusBase}%`);
    }

    let cycles: any[] = [];
    try {
      cycles = await db.prepare(query + " ORDER BY createdAt DESC").all(...params) as any[];
    } catch {
      try {
        cycles = await db.prepare(query + " ORDER BY created_at DESC").all(...params) as any[];
      } catch {
        try {
          cycles = await db.prepare(query + " ORDER BY id DESC").all(...params) as any[];
        } catch {
          cycles = await db.prepare(query).all(...params) as any[];
        }
      }
    }

    if (!Array.isArray(cycles)) {
      cycles = [];
    }

    // Check if any draft cycle is empty or has 0 totalNet, and auto-populate safely
    for (const c of cycles) {
      if (c && (c.status === 'draft' || !c.totalNet || Number(c.totalNet) === 0)) {
        try {
          const entryCount = await db.prepare("SELECT COUNT(*) as count FROM payroll_entries WHERE cycleId = ?").get(c.id) as any;
          if (!entryCount || Number(entryCount.count) === 0) {
            await populateCycleEmployees(c.id);
          }
        } catch (popErr) {
          console.warn(`[Payroll] Auto-populate warning for cycle ${c.id}:`, popErr);
        }
      }
    }

    // Refresh cycles with updated totals safely
    try {
      cycles = await db.prepare(query + " ORDER BY id DESC").all(...params) as any[];
    } catch {
      // keep existing cycles list
    }

    res.json(Array.isArray(cycles) ? cycles : []);
  } catch (err: any) {
    console.error("[Payroll] Error in GET /payroll-cycles:", err);
    res.status(500).json({ error: err.message || "Failed to fetch payroll cycles" });
  }
});

payrollRouter.post("/payroll-cycles", async (req: any, res: any) => {
  try {
    const { name, startDate, endDate, type, categoryFilter, managedBy, campus } = req.body;
    const id = `cycle-${Date.now()}`;

    // Get accountant profile
    let accountantName = "System Accountant";
    if (managedBy) {
      try {
        const accountantUser = await db.prepare("SELECT displayName FROM users WHERE id = ?").get(managedBy) as any;
        if (accountantUser) {
          accountantName = accountantUser.displayName;
        }
      } catch {}
    }

    const assignedCampus = campus || 'Hinunangan Campus';
    const sDate = startDate || null;
    const eDate = endDate || null;

    try {
      await db.prepare(`
        INSERT INTO payroll_cycles (id, name, startDate, endDate, type, categoryFilter, status, managedBy, managedByName, campus)
        VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
      `).run(id, name || `Cycle ${new Date().toISOString().split('T')[0]}`, sDate, eDate, type || 'all', categoryFilter || 'all', managedBy || 'accountant-1', accountantName, assignedCampus);
    } catch (insertErr: any) {
      console.warn("[Payroll] Standard insert failed, trying snake_case insert:", insertErr?.message);
      await db.prepare(`
        INSERT INTO payroll_cycles (id, name, start_date, end_date, type, category_filter, status, managed_by, managed_by_name, campus)
        VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
      `).run(id, name || `Cycle ${new Date().toISOString().split('T')[0]}`, sDate, eDate, type || 'all', categoryFilter || 'all', managedBy || 'accountant-1', accountantName, assignedCampus);
    }

    // Populate employees and calculate all deductions, DTR and totals
    await populateCycleEmployees(id);

    await logAudit(req, "CREATE_PAYROLL_CYCLE", `Created payroll cycle "${name}" for campus ${assignedCampus}`);
    res.json({ success: true, id });
  } catch (err: any) {
    console.error("[Payroll] Error in POST /payroll-cycles:", err);
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.post("/payroll-cycles/:id/populate", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await populateCycleEmployees(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.get("/payroll-cycles/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    let cycle = await db.prepare("SELECT * FROM payroll_cycles WHERE id = ?").get(id) as any;
    if (!cycle) return res.status(404).json({ error: "Cycle not found" });

    // Auto-populate if empty
    try {
      const entryCount = await db.prepare("SELECT COUNT(*) as count FROM payroll_entries WHERE cycleId = ?").get(id) as any;
      if (!entryCount || Number(entryCount.count) === 0) {
        await populateCycleEmployees(id);
        cycle = await db.prepare("SELECT * FROM payroll_cycles WHERE id = ?").get(id) as any;
      }
    } catch (popErr) {
      console.warn(`[Payroll] Auto-populate warning for cycle ${id}:`, popErr);
    }

    res.json(cycle);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.get("/payroll-cycles/:id/entries", async (req: any, res: any) => {
  try {
    const { id } = req.params;

    let entries = await db.prepare(`
      SELECT pe.*, e.employeeId as employeeNo, e.category, e.position, e.campus, e.email, e.phoneNumber, e.hasPhilhealth, e.hasPagibig, e.hasSss
      FROM payroll_entries pe
      LEFT JOIN employees e ON pe.employeeId = e.id
      WHERE pe.cycleId = ?
      ORDER BY pe.employeeName ASC
    `).all(id) as any[];

    if (entries.length === 0) {
      try {
        await populateCycleEmployees(id);
      } catch (err) {
        console.warn(`[Payroll] Populate error for cycle ${id}:`, err);
      }
    } else {
      try {
        const cycle = await db.prepare("SELECT * FROM payroll_cycles WHERE id = ?").get(id) as any;
        if (cycle && cycle.status === 'draft') {
          await calculateNetSalary(id);
        }
      } catch (calcErr) {
        console.warn(`[Payroll] Calculate error for cycle ${id}:`, calcErr);
      }
    }

    entries = await db.prepare(`
      SELECT pe.*, e.employeeId as employeeNo, e.category, e.position, e.campus, e.email, e.phoneNumber, e.hasPhilhealth, e.hasPagibig, e.hasSss, e.basicSalary, e.salaryType, e.bpno, e.crn
      FROM payroll_entries pe
      LEFT JOIN employees e ON pe.employeeId = e.id
      WHERE pe.cycleId = ?
      ORDER BY pe.employeeName ASC
    `).all(id) as any[];

    const formattedEntries = entries.map((pe) => {
      let customValues: any = {};
      let deductions: any = {};
      if (pe.custom_values_json) {
        try {
          customValues = typeof pe.custom_values_json === 'string' ? JSON.parse(pe.custom_values_json) : pe.custom_values_json;
        } catch {
          customValues = {};
        }
      }
      if (pe.deductions_json) {
        try {
          deductions = typeof pe.deductions_json === 'string' ? JSON.parse(pe.deductions_json) : pe.deductions_json;
        } catch {
          deductions = {};
        }
      }
      const resolvedSal2nd = pe.compSal2nd !== undefined && pe.compSal2nd !== null && Number(pe.compSal2nd) > 0
        ? Number(pe.compSal2nd)
        : (pe.basicPay !== undefined && pe.basicPay !== null && Number(pe.basicPay) > 0 ? Number(pe.basicPay) : Number(pe.basicSalary || 0));

      return {
        ...pe,
        compSal2nd: resolvedSal2nd,
        basicPay: pe.basicPay || resolvedSal2nd,
        customValues: { compSal2nd: resolvedSal2nd, ...deductions, ...customValues },
        deductions
      };
    });

    res.json(formattedEntries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.get("/payroll-cycles/:id/available-employees", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const cycle = await db.prepare("SELECT * FROM payroll_cycles WHERE id = ?").get(id) as any;
    if (!cycle) return res.status(404).json({ error: "Cycle not found" });

    let query = `
      SELECT * FROM employees 
      WHERE status = 'active'
      AND id NOT IN (SELECT employeeId FROM payroll_entries WHERE cycleId = ?)
    `;
    const params: any[] = [id];

    if (cycle.campus && cycle.campus !== 'All Campuses') {
      query += " AND (campus = ? OR campus IS NULL OR campus = '')";
      params.push(cycle.campus);
    }

    const available = await db.prepare(query).all(...params);
    res.json(available);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.post("/payroll-cycles/:id/entries", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { employeeIds } = req.body;
    if (!Array.isArray(employeeIds)) return res.status(400).json({ error: "employeeIds array required" });

    for (const empId of employeeIds) {
      const emp = await db.prepare("SELECT * FROM employees WHERE id = ?").get(empId) as any;
      if (emp) {
        // Check if already in cycle
        const existing = await db.prepare("SELECT id FROM payroll_entries WHERE cycleId = ? AND employeeId = ?").get(id, emp.id);
        if (!existing) {
          const entryId = `entry-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          const empName = `${emp.lastName ? emp.lastName + ', ' : ''}${emp.firstName || ''} ${emp.mi ? emp.mi + '.' : ''}`.trim();
          await db.prepare(`
            INSERT INTO payroll_entries (id, cycleId, employeeId, employeeName, basicPay, grossPay, netPay, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
          `).run(entryId, id, emp.id, empName, emp.basicSalary || 0, emp.basicSalary || 0, emp.basicSalary || 0);
        }
      }
    }

    await calculateNetSalary(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add single employee to cycle
payrollRouter.post("/payroll-cycles/:id/add-employee", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ error: "employeeId required" });

    // Check if already in cycle
    const existing = await db.prepare("SELECT id FROM payroll_entries WHERE cycleId = ? AND employeeId = ?").get(id, employeeId);
    if (existing) return res.json({ success: true, message: "Employee already in cycle" });

    const emp = await db.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId) as any;
    if (!emp) return res.status(404).json({ error: "Employee not found" });

    const cycle = await db.prepare("SELECT * FROM payroll_cycles WHERE id = ?").get(id) as any;
    const entryId = `entry-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const empName = `${emp.lastName ? emp.lastName + ', ' : ''}${emp.firstName || ''} ${emp.mi ? emp.mi + '.' : ''}`.trim();
    const basicPay = cycle?.type === 'semi-monthly' ? (emp.basicSalary / 2) : emp.basicSalary;

    await db.prepare(`
      INSERT INTO payroll_entries (id, cycleId, employeeId, employeeName, basicPay, grossPay, netPay, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(entryId, id, emp.id, empName, basicPay || 0, basicPay || 0, basicPay || 0);

    await calculateNetSalary(id);
    await logAudit(req, "ADD_EMPLOYEE_TO_CYCLE", `Added employee ${empName} to cycle ${id}`);
    res.json({ success: true, id: entryId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Recalculate Cycle Entries from DTR & System Rules
payrollRouter.post("/payroll-cycles/:id/recalculate", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await calculateNetSalary(id);
    res.json({ success: true, message: "Payroll cycle recalculated successfully from DTR" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Import Deductions into Cycle
payrollRouter.post("/payroll-cycles/:id/import-deductions", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const updates = Array.isArray(req.body) ? req.body : (req.body.updates || []);
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: "No deduction update data provided" });
    }

    const customColumnValues: { [entryId: string]: any } = {};

    for (const item of updates) {
      const entryId = item.id || item.entryId;
      if (!entryId) continue;

      const customVals = item.customValues || item.deductions || {};
      customColumnValues[entryId] = customVals;

      // Update custom_values_json in entry
      await db.prepare("UPDATE payroll_entries SET custom_values_json = ? WHERE id = ?").run(
        JSON.stringify(customVals),
        entryId
      );

      // Bidirectional sync: sync to deductions table
      const entryObj = await db.prepare("SELECT employeeId FROM payroll_entries WHERE id = ?").get(entryId) as any;
      if (entryObj?.employeeId) {
        await syncPayrollDeductionsToDeductionsTable(entryObj.employeeId, customVals);
      }
    }

    // Recalculate whole cycle with imported values
    await calculateNetSalary(id, undefined, customColumnValues);
    await logAudit(req, "IMPORT_CYCLE_DEDUCTIONS", `Imported deduction adjustments for ${updates.length} entries in cycle ${id}`);

    res.json({ success: true, count: updates.length });
  } catch (err: any) {
    console.error("Error importing deductions into cycle:", err);
    res.status(500).json({ error: err.message || "Failed to import deductions into cycle" });
  }
});

payrollRouter.post("/payroll-cycles/:id/process", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await calculateNetSalary(id);
    await db.prepare("UPDATE payroll_cycles SET status = 'completed' WHERE id = ?").run(id);
    await db.prepare("UPDATE payroll_entries SET status = 'completed' WHERE cycleId = ?").run(id);
    await logAudit(req, "PROCESS_PAYROLL_CYCLE", `Processed payroll calculation for cycle ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.post("/payroll-cycles/:id/revert", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("UPDATE payroll_cycles SET status = 'draft', approvedBy = NULL, approvedAt = NULL WHERE id = ?").run(id);
    await db.prepare("UPDATE payroll_entries SET status = 'pending' WHERE cycleId = ?").run(id);
    await logAudit(req, "REVERT_PAYROLL_CYCLE", `Reverted cycle ${id} to draft state`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.put("/payroll-cycles/:id/assign", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { managedBy, campus } = req.body;

    let accountantName = "System Accountant";
    if (managedBy) {
      const accountantUser = await db.prepare("SELECT displayName FROM users WHERE id = ?").get(managedBy) as any;
      if (accountantUser) {
        accountantName = accountantUser.displayName;
      }
    }

    await db.prepare(`
      UPDATE payroll_cycles SET managedBy = ?, managedByName = ?, campus = ? WHERE id = ?
    `).run(managedBy, accountantName, campus || 'Hinunangan Campus', id);

    await logAudit(req, "REASSIGN_PAYROLL_BATCH", `Assigned cycle ${id} to accountant ${accountantName} (${campus})`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.post("/payroll-cycles/:id/approve", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'] || req.headers['user-id'] || 'system';
    const userRole = req.headers['x-user-role'] || req.headers['user-role'];

    const user = await db.prepare("SELECT displayName FROM users WHERE id = ?").get(userId) as any;
    const approverName = user?.displayName || (userRole === 'admin' ? 'Administrator' : 'Accountant');

    await db.prepare(`
      UPDATE payroll_cycles SET status = 'approved', approvedBy = ?, approvedAt = CURRENT_TIMESTAMP WHERE id = ?
    `).run(approverName, id);

    await db.prepare("UPDATE payroll_entries SET status = 'approved' WHERE cycleId = ?").run(id);
    await logAudit(req, "APPROVE_PAYROLL_BATCH", `Approved payroll cycle ${id} by ${approverName}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.post("/payroll-cycles/:id/reject", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    await db.prepare(`
      UPDATE payroll_cycles SET status = 'draft', approvedBy = NULL, approvedAt = NULL WHERE id = ?
    `).run(id);
    await logAudit(req, "REJECT_PAYROLL_BATCH", `Rejected payroll cycle ${id}. Reason: ${reason || 'Needs review'}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.post("/payroll-cycles/:id/disburse", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("UPDATE payroll_cycles SET status = 'disbursed' WHERE id = ?").run(id);
    await db.prepare("UPDATE payroll_entries SET status = 'disbursed' WHERE cycleId = ?").run(id);

    // Process loan deductions to update loan balances and insert payment logs
    const entries = await db.prepare("SELECT * FROM payroll_entries WHERE cycleId = ?").all(id) as any[];
    const loanMappings = [
      { col: 'dedConsolLoan', types: ['consoloan', 'consol loan', 'consolidation loan', 'conso loan'] },
      { col: 'dedEmergencyLoan', types: ['emrgyln', 'emergency loan', 'emrgy loan'] },
      { col: 'dedGfal', types: ['gfal', 'financial assistance loan'] },
      { col: 'dedMpl', types: ['mpl', 'multipurpose loan', 'multi purpose loan'] },
      { col: 'dedCpl', types: ['cpl', 'computer loan', 'computer purchase loan'] },
      { col: 'dedMplLite', types: ['mpllite', 'mpl lite', 'mpl_lite'] },
      { col: 'dedEducAsst', types: ['educasst', 'educational assistance'] },
      { col: 'dedPolicyLoan', types: ['policyloan', 'policy loan'] },
      { col: 'dedPagibigMpl', types: ['pagibigmpl', 'hdmf mpl', 'pag-ibig mpl'] },
      { col: 'dedPagibigMp2', types: ['mp2', 'pagibig mp2', 'pag-ibig mp2'] },
      { col: 'dedCsbLoan', types: ['csbloan', 'csb loan', 'csb', 'chinabank'] }
    ];

    for (const entry of entries) {
      const empLoans = await db.prepare("SELECT * FROM loans WHERE employeeId = ? AND (status = 'active' OR status IS NULL) AND remainingBalance > 0").all(entry.employeeId) as any[];
      if (empLoans.length > 0) {
        for (const mapping of loanMappings) {
          const deductAmt = Number(entry[mapping.col] || 0);
          if (deductAmt > 0) {
            const matchedLoan = empLoans.find(l => {
              const lT = String(l.loanType || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              return mapping.types.some(t => lT.includes(t.replace(/[^a-z0-9]/g, '')));
            });

            if (matchedLoan) {
              const paymentAmt = Math.min(deductAmt, Number(matchedLoan.remainingBalance));
              const newBalance = Math.max(0, Number((Number(matchedLoan.remainingBalance) - paymentAmt).toFixed(2)));
              const newStatus = newBalance === 0 ? 'paid' : 'active';
              
              await db.prepare("UPDATE loans SET remainingBalance = ?, status = ? WHERE id = ?").run(newBalance, newStatus, matchedLoan.id);
              
              const pId = 'lp-' + Math.random().toString(36).substring(2, 9);
              await db.prepare(`
                INSERT INTO loan_payments (id, loanId, amount, paymentDate, orNumber, notes)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
              `).run(pId, matchedLoan.id, paymentAmt, `CYCLE-${id}`, `Payroll auto-deduction for cycle ${id}`);
            }
          }
        }
      }
    }

    await syncPayrollCycleToRecord(id);
    await logAudit(req, "DISBURSE_PAYROLL_CYCLE", `Disbursed and archived payroll cycle ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.delete("/payroll-cycles/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM payroll_entries WHERE cycleId = ?").run(id);
    await db.prepare("DELETE FROM payroll_records WHERE cycleId = ?").run(id);
    await db.prepare("DELETE FROM payroll_cycles WHERE id = ?").run(id);
    await logAudit(req, "DELETE_PAYROLL_CYCLE", `Deleted payroll cycle ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Single Entry Operations
payrollRouter.delete("/payroll-entries/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const entry = await db.prepare("SELECT cycleId, employeeName FROM payroll_entries WHERE id = ?").get(id) as any;
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    await db.prepare("DELETE FROM payroll_entries WHERE id = ?").run(id);
    await calculateNetSalary(entry.cycleId);
    await logAudit(req, "DELETE_PAYROLL_ENTRY", `Removed ${entry.employeeName} from cycle ${entry.cycleId}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.get("/payroll-entries/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const entry = await db.prepare(`
      SELECT pe.*, e.employeeId as employeeNo, e.category, e.position, e.campus, e.email, e.phoneNumber
      FROM payroll_entries pe
      LEFT JOIN employees e ON pe.employeeId = e.id
      WHERE pe.id = ?
    `).get(id) as any;
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    let customValues = {};
    let deductions = {};
    if (entry.custom_values_json) {
      try {
        customValues = typeof entry.custom_values_json === 'string' ? JSON.parse(entry.custom_values_json) : entry.custom_values_json;
      } catch {
        customValues = {};
      }
    }
    if (entry.deductions_json) {
      try {
        deductions = typeof entry.deductions_json === 'string' ? JSON.parse(entry.deductions_json) : entry.deductions_json;
      } catch {
        deductions = {};
      }
    }

    res.json({
      ...entry,
      customValues: { ...deductions, ...customValues },
      deductions
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.put("/payroll-entries/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { basicPay, overtime, bonuses, allowances, otHours, teachingHours, custom_values_json, customValues } = req.body;

    const entry = await db.prepare("SELECT * FROM payroll_entries WHERE id = ?").get(id) as any;
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    let updatedCustomJson = custom_values_json;
    if (customValues && typeof customValues === 'object') {
      let existingCustom = {};
      if (entry.custom_values_json) {
        try {
          existingCustom = typeof entry.custom_values_json === 'string' ? JSON.parse(entry.custom_values_json) : entry.custom_values_json;
        } catch {
          existingCustom = {};
        }
      }
      updatedCustomJson = JSON.stringify({ ...existingCustom, ...customValues });
    }

    await db.prepare(`
      UPDATE payroll_entries SET
        basicPay = ?, overtime = ?, bonuses = ?, allowances = ?, otHours = ?,
        teachingHours = ?, custom_values_json = ?
      WHERE id = ?
    `).run(
      basicPay !== undefined ? basicPay : entry.basicPay,
      overtime !== undefined ? overtime : entry.overtime,
      bonuses !== undefined ? bonuses : entry.bonuses,
      allowances !== undefined ? allowances : entry.allowances,
      otHours !== undefined ? otHours : entry.otHours,
      teachingHours !== undefined ? teachingHours : entry.teachingHours,
      updatedCustomJson !== undefined ? updatedCustomJson : entry.custom_values_json,
      id
    );

    const customOverrides = customValues && typeof customValues === 'object' ? { [id]: customValues } : undefined;
    await calculateNetSalary(entry.cycleId, entry.employeeId, customOverrides);

    // Bidirectional sync: sync to deductions table
    if (customValues && typeof customValues === 'object') {
      await syncPayrollDeductionsToDeductionsTable(entry.employeeId, customValues);
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.post("/payroll-entries/:id/validate", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { isValidated } = req.body;
    await db.prepare("UPDATE payroll_entries SET isValidated = ? WHERE id = ?").run(isValidated ? 1 : 0, id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.post("/payroll-entries/:id/recalculate", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const entry = await db.prepare("SELECT cycleId, employeeId FROM payroll_entries WHERE id = ?").get(id) as any;
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    await calculateNetSalary(entry.cycleId, entry.employeeId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Employee Portal / My Payroll
payrollRouter.get("/my-payroll", async (req: any, res: any) => {
  try {
    const { email } = req.query;
    const userId = req.headers['x-user-id'] || req.headers['user-id'];
    let employee = null;

    if (email) {
      employee = await db.prepare("SELECT * FROM employees WHERE LOWER(email) = LOWER(?)").get(email) as any;
    }
    if (!employee && userId) {
      employee = await db.prepare("SELECT * FROM employees WHERE id = ?").get(userId) as any;
    }

    if (!employee) {
      return res.json([]);
    }

    let entries: any[] = [];
    try {
      entries = await db.prepare(`
        SELECT pe.*, pc.name as cycleName, pc.startDate, pc.endDate, pc.status as cycleStatus, pc.type as cycleType, pc.campus as cycleCampus
        FROM payroll_entries pe
        JOIN payroll_cycles pc ON pe.cycleId = pc.id
        WHERE pe.employeeId = ?
        ORDER BY pc.createdAt DESC
      `).all(employee.id) as any[];
    } catch {
      try {
        entries = await db.prepare(`
          SELECT pe.*, pc.name as cycleName, pc.startDate, pc.endDate, pc.status as cycleStatus, pc.type as cycleType, pc.campus as cycleCampus
          FROM payroll_entries pe
          JOIN payroll_cycles pc ON pe.cycleId = pc.id
          WHERE pe.employeeId = ?
          ORDER BY pc.created_at DESC
        `).all(employee.id) as any[];
      } catch {
        entries = await db.prepare(`
          SELECT pe.*, pc.name as cycleName, pc.startDate, pc.endDate, pc.status as cycleStatus, pc.type as cycleType, pc.campus as cycleCampus
          FROM payroll_entries pe
          JOIN payroll_cycles pc ON pe.cycleId = pc.id
          WHERE pe.employeeId = ?
          ORDER BY pc.id DESC
        `).all(employee.id) as any[];
      }
    }

    const formattedEntries = entries.map((pe) => {
      let customValues = {};
      let deductions = {};
      if (pe.custom_values_json) {
        try {
          customValues = typeof pe.custom_values_json === 'string' ? JSON.parse(pe.custom_values_json) : pe.custom_values_json;
        } catch {
          customValues = {};
        }
      }
      if (pe.deductions_json) {
        try {
          deductions = typeof pe.deductions_json === 'string' ? JSON.parse(pe.deductions_json) : pe.deductions_json;
        } catch {
          deductions = {};
        }
      }
      return {
        ...pe,
        customValues: { ...deductions, ...customValues },
        deductions
      };
    });

    res.json(formattedEntries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Payroll Records (Archived & Historical)
payrollRouter.get("/payroll-records", async (req: any, res: any) => {
  try {
    await syncAllCyclesToRecords();
    const { year, month, search } = req.query;

    let query = "SELECT * FROM payroll_records WHERE 1=1";
    const params: any[] = [];

    if (year) {
      query += " AND year = ?";
      params.push(Number(year));
    }
    if (month) {
      query += " AND month = ?";
      params.push(Number(month));
    }
    if (search) {
      query += " AND (title LIKE ? OR notes LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    let rawRecords: any[] = [];
    try {
      rawRecords = await db.prepare(query + " ORDER BY year DESC, month DESC, createdAt DESC").all(...params) as any[];
    } catch {
      try {
        rawRecords = await db.prepare(query + " ORDER BY year DESC, month DESC, created_at DESC").all(...params) as any[];
      } catch {
        rawRecords = await db.prepare(query + " ORDER BY year DESC, month DESC, id DESC").all(...params) as any[];
      }
    }

    // Parse JSON if needed
    const records = rawRecords.map(r => {
      let recordData = [];
      if (r.recordDataJson) {
        try {
          recordData = typeof r.recordDataJson === 'string' ? JSON.parse(r.recordDataJson) : r.recordDataJson;
        } catch {
          recordData = [];
        }
      }
      return { ...r, recordData };
    });

    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.get("/payroll-records/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const rec = await db.prepare("SELECT * FROM payroll_records WHERE id = ?").get(id) as any;
    if (!rec) return res.status(404).json({ error: "Record not found" });

    let recordData = [];
    if (rec.recordDataJson) {
      try {
        recordData = typeof rec.recordDataJson === 'string' ? JSON.parse(rec.recordDataJson) : rec.recordDataJson;
      } catch {
        recordData = [];
      }
    }

    res.json({ ...rec, recordData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.post("/payroll-records", async (req: any, res: any) => {
  try {
    const { cycleId, year, month, monthName, title, periodType, totalEmployees, totalGross, totalDeductions, totalNet, status, notes, recordData } = req.body;
    const id = req.body.id || `rec-${Date.now()}`;
    const mName = monthName || (month ? MONTH_NAMES_LIST[Number(month) - 1] : 'January');
    const jsonStr = recordData ? JSON.stringify(recordData) : "[]";

    await db.prepare(`
      INSERT INTO payroll_records (id, cycleId, year, month, monthName, title, periodType, totalEmployees, totalGross, totalDeductions, totalNet, status, notes, recordDataJson)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, cycleId || null, year || new Date().getFullYear(), month || (new Date().getMonth() + 1),
      mName, title || `Payroll Record ${mName} ${year}`, periodType || 'monthly',
      totalEmployees || 0, totalGross || 0, totalDeductions || 0, totalNet || 0,
      status || 'saved', notes || "", jsonStr
    );

    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.post("/payroll-records/save-from-cycle/:cycleId", async (req: any, res: any) => {
  try {
    const { cycleId } = req.params;
    await syncPayrollCycleToRecord(cycleId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.put("/payroll-records/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { title, year, month, monthName, periodType, totalEmployees, totalGross, totalDeductions, totalNet, status, notes, recordData } = req.body;

    const existing = await db.prepare("SELECT * FROM payroll_records WHERE id = ?").get(id) as any;
    if (!existing) return res.status(404).json({ error: "Record not found" });

    const mName = monthName || (month ? MONTH_NAMES_LIST[Number(month) - 1] : existing.monthName);
    const jsonStr = recordData !== undefined ? JSON.stringify(recordData) : existing.recordDataJson;

    await db.prepare(`
      UPDATE payroll_records SET
        title = COALESCE(?, title),
        year = COALESCE(?, year),
        month = COALESCE(?, month),
        monthName = COALESCE(?, monthName),
        periodType = COALESCE(?, periodType),
        totalEmployees = COALESCE(?, totalEmployees),
        totalGross = COALESCE(?, totalGross),
        totalDeductions = COALESCE(?, totalDeductions),
        totalNet = COALESCE(?, totalNet),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        recordDataJson = ?,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title, year, month, mName, periodType, totalEmployees, totalGross,
      totalDeductions, totalNet, status, notes, jsonStr, id
    );

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.delete("/payroll-records/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM payroll_records WHERE id = ?").run(id);
    await logAudit(req, "DELETE_PAYROLL_RECORD", `Deleted payroll record ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.get("/payroll-records/years", async (req: any, res: any) => {
  try {
    const years = await db.prepare("SELECT DISTINCT year FROM payroll_records ORDER BY year DESC").all();
    res.json(years.map((y: any) => y.year));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.get("/payroll-records/by-year/:year", async (req: any, res: any) => {
  try {
    const { year } = req.params;
    const records = await db.prepare("SELECT * FROM payroll_records WHERE year = ? ORDER BY month DESC").all(year);
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.get("/payroll-records/by-month/:year/:month", async (req: any, res: any) => {
  try {
    const { year, month } = req.params;
    const records = await db.prepare("SELECT * FROM payroll_records WHERE year = ? AND month = ?").all(year, month);
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Compensation Plans
payrollRouter.get("/compensation-plans", async (req: any, res: any) => {
  try {
    const plans = await db.prepare("SELECT * FROM compensation_plans ORDER BY name ASC").all();
    res.json(plans);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.post("/compensation-plans", async (req: any, res: any) => {
  try {
    const { name, category, baseRate, peraAmount, hazardPay, description } = req.body;
    const id = `plan-${Date.now()}`;
    await db.prepare(`
      INSERT INTO compensation_plans (id, name, category, baseRate, peraAmount, hazardPay, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, category, baseRate || 0, peraAmount || 2000, hazardPay || 0, description || "");
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Payroll Settings
payrollRouter.get("/payroll-settings", async (req: any, res: any) => {
  try {
    const settings = await db.prepare("SELECT * FROM payroll_settings").all();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.post("/payroll-settings", async (req: any, res: any) => {
  try {
    const { key, value, description } = req.body;
    const id = `set-${key}`;
    await db.prepare(`
      INSERT OR REPLACE INTO payroll_settings (id, \`key\`, value, description, updatedAt)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, key, value, description || "");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
