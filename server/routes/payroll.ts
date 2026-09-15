import { Router } from "express";
import { db, logAudit, MONTH_NAMES_LIST } from "../db/schema.js";
import { calculateNetSalary, syncPayrollCycleToRecord, syncAllCyclesToRecords, syncPayrollDeductionsToDeductionsTable } from "../services/payrollCalculator.js";
import { broadcastRealtime } from "../index.js";

export const payrollRouter = Router();

export function isEmployeeMatchingCategoryFilter(empCategory: string, cycleCategoryFilter: string): boolean {
  if (!cycleCategoryFilter || cycleCategoryFilter === 'all' || cycleCategoryFilter === 'ALL') return true;
  const filter = cycleCategoryFilter.toLowerCase().trim();
  const cat = (empCategory || '').toUpperCase().trim();

  const isVisiting = cat.includes('VISITING') || cat.includes('PART-TIME') || cat.includes('PART TIME') || cat.includes('LECTURER') || cat === 'VI' || cat.startsWith('VI ') || cat.endsWith(' VI');
  const isJobOrder = cat.includes('JOB ORDER') || cat.includes('JOB_ORDER') || cat.includes('JOB-ORDER') || cat === 'JO' || cat.startsWith('JO ') || cat.endsWith(' JO');
  const isFacultyOrStaff = (cat.includes('FACULTY') || cat.includes('STAFF') || cat === 'REGULAR EMPLOYEE' || cat === 'PERMANENT' || cat === 'REGULAR') && !isVisiting && !isJobOrder;

  if (filter === 'visiting-instructor' || filter === 'visiting instructor' || filter === 'visiting' || filter.includes('visiting')) {
    return isVisiting && !isJobOrder;
  }

  if (filter === 'faculty-staff' || filter === 'faculty & staff' || filter === 'faculty_staff' || filter.includes('faculty')) {
    return isFacultyOrStaff;
  }

  if (filter === 'job-order' || filter === 'job order' || filter === 'jo' || filter.includes('job')) {
    return isJobOrder && !isVisiting;
  }

  return cat === filter.toUpperCase() || cat.includes(filter.toUpperCase());
}

// Helper to populate initial employees and calculate calculations
export async function populateCycleEmployees(cycleId: string) {
  try {
    const cycle = await db.prepare("SELECT * FROM payroll_cycles WHERE id = ?").get(cycleId) as any;
    if (!cycle) return;

    const rawCat = cycle.categoryFilter || cycle.category_filter || ((cycle.name && (cycle.name.trim().toUpperCase() === 'VI' || cycle.name.toLowerCase().includes('visiting'))) ? 'visiting-instructor' : 'all');
    const catFilter = (rawCat || 'all').toLowerCase();
    const isStrictVisiting = catFilter === 'visiting-instructor' || catFilter === 'visiting instructor' || catFilter === 'visiting' || catFilter.includes('visiting');
    const isStrictFacultyStaff = catFilter === 'faculty-staff' || catFilter === 'faculty & staff' || catFilter === 'faculty_staff' || catFilter.includes('faculty');
    const isStrictJobOrder = catFilter === 'job-order' || catFilter === 'job order' || catFilter === 'jo' || catFilter.includes('job');

    // Remove any entries that violate the cycle's category filter if it's strict
    if (isStrictVisiting || isStrictFacultyStaff || isStrictJobOrder) {
      const existingEntries = await db.prepare(`
        SELECT pe.id, pe.employeeId, e.category 
        FROM payroll_entries pe 
        LEFT JOIN employees e ON pe.employeeId = e.id 
        WHERE pe.cycleId = ?
      `).all(cycleId) as any[];

      for (const ent of existingEntries) {
        if (!isEmployeeMatchingCategoryFilter(ent.category, rawCat)) {
          await db.prepare("DELETE FROM payroll_entries WHERE id = ?").run(ent.id);
        }
      }
    }

    const currentEntries = await db.prepare("SELECT employeeId FROM payroll_entries WHERE cycleId = ?").all(cycleId) as any[];
    const currentEmpIds = new Set(currentEntries.map(e => e.employeeId));

    let empQuery = "SELECT * FROM employees WHERE status = 'active' OR status IS NULL";
    const empParams: any[] = [];

    // Filter category
    if (isStrictVisiting) {
      empQuery += " AND (UPPER(category) LIKE '%VISITING%' OR UPPER(category) LIKE '%PART-TIME%' OR UPPER(category) LIKE '%PART TIME%' OR UPPER(category) LIKE '%LECTURER%' OR UPPER(category) = 'VI' OR UPPER(category) LIKE 'VI %' OR UPPER(category) LIKE '% VI') AND UPPER(category) NOT LIKE '%JOB ORDER%' AND UPPER(category) NOT LIKE '%JOB_ORDER%' AND UPPER(category) NOT LIKE '%JOB-ORDER%' AND UPPER(category) != 'JO'";
    } else if (isStrictFacultyStaff) {
      empQuery += " AND (UPPER(category) LIKE '%FACULTY%' OR UPPER(category) LIKE '%STAFF%' OR UPPER(category) LIKE '%REGULAR%' OR UPPER(category) = 'PERMANENT') AND UPPER(category) NOT LIKE '%VISITING%' AND UPPER(category) NOT LIKE '%PART-TIME%' AND UPPER(category) NOT LIKE '%PART TIME%' AND UPPER(category) NOT LIKE '%LECTURER%' AND UPPER(category) NOT LIKE '%JOB ORDER%' AND UPPER(category) NOT LIKE '%JOB_ORDER%' AND UPPER(category) NOT LIKE '%JOB-ORDER%' AND UPPER(category) != 'JO' AND UPPER(category) != 'VI'";
    } else if (isStrictJobOrder) {
      empQuery += " AND (UPPER(category) LIKE '%JOB ORDER%' OR UPPER(category) LIKE '%JOB_ORDER%' OR UPPER(category) LIKE '%JOB-ORDER%' OR UPPER(category) = 'JO' OR UPPER(category) LIKE 'JO %' OR UPPER(category) LIKE '% JO') AND UPPER(category) NOT LIKE '%VISITING%'";
    } else if (catFilter !== 'all') {
      empQuery += " AND (category = ? OR UPPER(category) = UPPER(?) OR category LIKE ?)";
      empParams.push(rawCat, rawCat, `%${rawCat}%`);
    }

    // Filter campus if specified
    if (cycle.campus && cycle.campus !== 'All Campuses') {
      const campusBase = cycle.campus.replace(/Campus/i, '').trim();
      empQuery += " AND (campus = ? OR campus LIKE ? OR campus IS NULL OR campus = '')";
      empParams.push(cycle.campus, `%${campusBase}%`);
    }

    let matchingEmployees = await db.prepare(empQuery).all(...empParams) as any[];

    // If no employees matched the strict campus filter, fallback to active employees matching that category across any campus
    if (matchingEmployees.length === 0 && cycle.campus && cycle.campus !== 'All Campuses') {
      let fallbackQuery = "SELECT * FROM employees WHERE status = 'active' OR status IS NULL";
      const fallbackParams: any[] = [];
      if (isStrictVisiting) {
        fallbackQuery += " AND (UPPER(category) LIKE '%VISITING%' OR UPPER(category) LIKE '%PART-TIME%' OR UPPER(category) LIKE '%PART TIME%' OR UPPER(category) LIKE '%LECTURER%' OR UPPER(category) = 'VI' OR UPPER(category) LIKE 'VI %' OR UPPER(category) LIKE '% VI') AND UPPER(category) NOT LIKE '%JOB ORDER%' AND UPPER(category) NOT LIKE '%JOB_ORDER%' AND UPPER(category) NOT LIKE '%JOB-ORDER%' AND UPPER(category) != 'JO'";
      } else if (isStrictFacultyStaff) {
        fallbackQuery += " AND (UPPER(category) LIKE '%FACULTY%' OR UPPER(category) LIKE '%STAFF%' OR UPPER(category) LIKE '%REGULAR%' OR UPPER(category) = 'PERMANENT') AND UPPER(category) NOT LIKE '%VISITING%' AND UPPER(category) NOT LIKE '%PART-TIME%' AND UPPER(category) NOT LIKE '%PART TIME%' AND UPPER(category) NOT LIKE '%LECTURER%' AND UPPER(category) NOT LIKE '%JOB ORDER%' AND UPPER(category) NOT LIKE '%JOB_ORDER%' AND UPPER(category) NOT LIKE '%JOB-ORDER%' AND UPPER(category) != 'JO' AND UPPER(category) != 'VI'";
      } else if (isStrictJobOrder) {
        fallbackQuery += " AND (UPPER(category) LIKE '%JOB ORDER%' OR UPPER(category) LIKE '%JOB_ORDER%' OR UPPER(category) LIKE '%JOB-ORDER%' OR UPPER(category) = 'JO' OR UPPER(category) LIKE 'JO %' OR UPPER(category) LIKE '% JO') AND UPPER(category) NOT LIKE '%VISITING%'";
      } else if (catFilter !== 'all') {
        fallbackQuery += " AND (category = ? OR UPPER(category) = UPPER(?) OR category LIKE ?)";
        fallbackParams.push(rawCat, rawCat, `%${rawCat}%`);
      }
      matchingEmployees = await db.prepare(fallbackQuery).all(...fallbackParams) as any[];
    }

    // Note: If still empty and catFilter is strict, do NOT fallback to other categories!
    if (matchingEmployees.length === 0 && catFilter === 'all') {
      matchingEmployees = await db.prepare("SELECT * FROM employees WHERE status = 'active' OR status IS NULL").all() as any[];
    }

    for (const emp of matchingEmployees) {
      if (currentEmpIds.has(emp.id)) continue;
      // Double check category validity
      if (!isEmployeeMatchingCategoryFilter(emp.category, rawCat)) continue;

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

    // Retrieve live aggregate sums from payroll_entries to ensure totalNet is always accurate
    let entrySummaries: any[] = [];
    try {
      entrySummaries = await db.prepare(`
        SELECT 
          "cycleId",
          COUNT(*) as emp_count,
          COALESCE(SUM(CAST("grossPay" AS numeric)), 0) as live_gross,
          COALESCE(SUM(CAST("totalDeductions" AS numeric)), 0) as live_deductions,
          COALESCE(SUM(CASE WHEN CAST("netPay" AS numeric) > 0 THEN CAST("netPay" AS numeric) ELSE 0 END), 0) as live_net
        FROM payroll_entries
        GROUP BY "cycleId"
      `).all() as any[];
    } catch {
      try {
        entrySummaries = await db.prepare(`
          SELECT 
            cycleId,
            COUNT(*) as emp_count,
            COALESCE(SUM(grossPay), 0) as live_gross,
            COALESCE(SUM(totalDeductions), 0) as live_deductions,
            COALESCE(SUM(CASE WHEN netPay > 0 THEN netPay ELSE 0 END), 0) as live_net
          FROM payroll_entries
          GROUP BY cycleId
        `).all() as any[];
      } catch {}
    }

    const summaryMap: Record<string, any> = {};
    for (const s of entrySummaries) {
      const cId = s.cycleId || s.cycle_id || s.cycleid;
      if (cId) {
        summaryMap[cId] = {
          count: Number(s.emp_count || 0),
          gross: Number(s.live_gross || 0),
          deductions: Number(s.live_deductions || 0),
          net: Number(s.live_net || 0),
        };
      }
    }

    cycles = cycles.map(c => {
      const live = summaryMap[c.id];
      const hasLive = live && live.count > 0;
      const storedNet = Number(c.totalNet ?? c.total_net ?? c.totalnet ?? 0);
      const storedGross = Number(c.totalGross ?? c.total_gross ?? c.totalgross ?? 0);
      const storedDeds = Number(c.totalDeductions ?? c.total_deductions ?? c.totaldeductions ?? 0);

      const effectiveNet = (hasLive && (storedNet === 0 || live.net > 0)) ? live.net : storedNet;
      const effectiveGross = (hasLive && (storedGross === 0 || live.gross > 0)) ? live.gross : storedGross;
      const effectiveDeds = (hasLive && (storedDeds === 0 || live.deductions > 0)) ? live.deductions : storedDeds;

      return {
        ...c,
        totalGross: effectiveGross.toFixed(2),
        totalDeductions: effectiveDeds.toFixed(2),
        totalNet: effectiveNet.toFixed(2),
        total_gross: effectiveGross.toFixed(2),
        total_deductions: effectiveDeds.toFixed(2),
        total_net: effectiveNet.toFixed(2),
        categoryFilter: c.categoryFilter || c.category_filter || ((c.name && (c.name.trim().toUpperCase() === 'VI' || c.name.toLowerCase().includes('visiting'))) ? 'visiting-instructor' : 'all')
      };
    });

    res.json(cycles);
  } catch (err: any) {
    console.error("[Payroll] Error in GET /payroll-cycles:", err);
    res.status(500).json({ error: err.message || "Failed to fetch payroll cycles" });
  }
});

// Update cycle totals directly (e.g. from client-side spreadsheet realTimeTotals sync)
payrollRouter.put("/payroll-cycles/:id/totals", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { totalGross, totalDeductions, totalNet } = req.body;
    const numGross = Number(totalGross || 0).toFixed(2);
    const numDeds = Number(totalDeductions || 0).toFixed(2);
    const numNet = Number(totalNet || 0).toFixed(2);

    try {
      await db.prepare(`
        UPDATE payroll_cycles 
        SET "totalGross" = ?, "totalDeductions" = ?, "totalNet" = ?,
            total_gross = ?, total_deductions = ?, total_net = ?
        WHERE id = ?
      `).run(numGross, numDeds, numNet, numGross, numDeds, numNet, id);
    } catch {
      await db.prepare(`
        UPDATE payroll_cycles 
        SET "totalGross" = ?, "totalDeductions" = ?, "totalNet" = ?
        WHERE id = ?
      `).run(numGross, numDeds, numNet, id);
    }

    broadcastRealtime("payroll_changed", { cycleId: id, source: "updateTotals" });
    res.json({ success: true, totalGross: numGross, totalDeductions: numDeds, totalNet: numNet });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.put("/payroll-cycles/:id/category-filter", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { categoryFilter } = req.body;
    if (!categoryFilter) return res.status(400).json({ error: "categoryFilter required" });

    try {
      await db.prepare(`
        UPDATE payroll_cycles 
        SET "categoryFilter" = ?, category_filter = ? 
        WHERE id = ?
      `).run(categoryFilter, categoryFilter, id);
    } catch {
      await db.prepare(`
        UPDATE payroll_cycles 
        SET category_filter = ? 
        WHERE id = ?
      `).run(categoryFilter, id);
    }

    // If filtering to visiting-instructor, immediately purge non-visiting entries
    if (categoryFilter === 'visiting-instructor' || categoryFilter.includes('visiting')) {
      const entries = await db.prepare("SELECT pe.id, e.category, e.position FROM payroll_entries pe LEFT JOIN employees e ON pe.employeeId = e.id WHERE pe.cycleId = ?").all(id) as any[];
      for (const ent of entries) {
        if (!isEmployeeMatchingCategoryFilter(ent.category, 'visiting-instructor')) {
          await db.prepare("DELETE FROM payroll_entries WHERE id = ?").run(ent.id);
        }
      }
    } else if (categoryFilter === 'faculty-staff' || categoryFilter.includes('faculty')) {
      const entries = await db.prepare("SELECT pe.id, e.category, e.position FROM payroll_entries pe LEFT JOIN employees e ON pe.employeeId = e.id WHERE pe.cycleId = ?").all(id) as any[];
      for (const ent of entries) {
        if (!isEmployeeMatchingCategoryFilter(ent.category, 'faculty-staff')) {
          await db.prepare("DELETE FROM payroll_entries WHERE id = ?").run(ent.id);
        }
      }
    } else if (categoryFilter === 'job-order' || categoryFilter === 'job order' || categoryFilter === 'jo' || categoryFilter.includes('job')) {
      const entries = await db.prepare("SELECT pe.id, e.category, e.position FROM payroll_entries pe LEFT JOIN employees e ON pe.employeeId = e.id WHERE pe.cycleId = ?").all(id) as any[];
      for (const ent of entries) {
        if (!isEmployeeMatchingCategoryFilter(ent.category, 'job-order')) {
          await db.prepare("DELETE FROM payroll_entries WHERE id = ?").run(ent.id);
        }
      }
    }

    if (categoryFilter !== 'all') {
      await populateCycleEmployees(id);
    }
    await calculateNetSalary(id);

    res.json({ success: true, categoryFilter });
  } catch (err: any) {
    console.error("[Payroll] Error in PUT /payroll-cycles/:id/category-filter:", err);
    res.status(500).json({ error: err.message });
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
        INSERT INTO payroll_cycles (id, name, "startDate", "endDate", type, "categoryFilter", category_filter, status, "managedBy", "managedByName", campus)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
      `).run(id, name || `Cycle ${new Date().toISOString().split('T')[0]}`, sDate, eDate, type || 'all', categoryFilter || 'all', categoryFilter || 'all', managedBy || 'accountant-1', accountantName, assignedCampus);
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

    if (cycle) {
      cycle.categoryFilter = cycle.categoryFilter || cycle.category_filter || ((cycle.name && (cycle.name.trim().toUpperCase() === 'VI' || cycle.name.toLowerCase().includes('visiting'))) ? 'visiting-instructor' : 'all');
      
      const storedNet = Number(cycle.totalNet ?? cycle.total_net ?? cycle.totalnet ?? 0);
      if (storedNet === 0) {
        try {
          const liveSum = await db.prepare(`
            SELECT 
              COALESCE(SUM(CAST("grossPay" AS numeric)), 0) as live_gross,
              COALESCE(SUM(CAST("totalDeductions" AS numeric)), 0) as live_deductions,
              COALESCE(SUM(CASE WHEN CAST("netPay" AS numeric) > 0 THEN CAST("netPay" AS numeric) ELSE 0 END), 0) as live_net
            FROM payroll_entries 
            WHERE "cycleId" = ? OR cycleId = ?
          `).get(id, id) as any;
          if (liveSum && (Number(liveSum.live_net || 0) > 0 || Number(liveSum.live_gross || 0) > 0)) {
            cycle.totalGross = Number(liveSum.live_gross || 0).toFixed(2);
            cycle.totalDeductions = Number(liveSum.live_deductions || 0).toFixed(2);
            cycle.totalNet = Number(liveSum.live_net || 0).toFixed(2);
          }
        } catch {}
      }
    }

    res.json(cycle);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.get("/payroll-cycles/:id/entries", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const cycle = await db.prepare("SELECT * FROM payroll_cycles WHERE id = ?").get(id) as any;

    let entries = await db.prepare(`
      SELECT pe.*, e.employeeId as employeeNo, e.category, e.position, e.campus, e.email, e.phoneNumber, e.hasPhilhealth, e.hasPagibig, e.hasSss, e.basicSalary, e.salaryType, e.bpno, e.crn
      FROM payroll_entries pe
      LEFT JOIN employees e ON pe.employeeId = e.id
      WHERE pe.cycleId = ?
      ORDER BY pe.employeeName ASC
    `).all(id) as any[];

    // If cycle has a specific category filter, enforce strict matching and purge any mismatched entries from DB
    const rawCycleCat = cycle?.categoryFilter || cycle?.category_filter || ((cycle?.name && (cycle.name.trim().toUpperCase() === 'VI' || cycle.name.toLowerCase().includes('visiting'))) ? 'visiting-instructor' : 'all');
    if (cycle && rawCycleCat && rawCycleCat !== 'all') {
      const nonMatching = entries.filter((pe) => !isEmployeeMatchingCategoryFilter(pe.category, rawCycleCat));
      for (const nm of nonMatching) {
        await db.prepare("DELETE FROM payroll_entries WHERE id = ?").run(nm.id);
      }
      entries = entries.filter((pe) => isEmployeeMatchingCategoryFilter(pe.category, rawCycleCat));
    }

    if (entries.length === 0) {
      try {
        await populateCycleEmployees(id);
        entries = await db.prepare(`
          SELECT pe.*, e.employeeId as employeeNo, e.category, e.position, e.campus, e.email, e.phoneNumber, e.hasPhilhealth, e.hasPagibig, e.hasSss, e.basicSalary, e.salaryType, e.bpno, e.crn
          FROM payroll_entries pe
          LEFT JOIN employees e ON pe.employeeId = e.id
          WHERE pe.cycleId = ?
          ORDER BY pe.employeeName ASC
        `).all(id) as any[];

        if (cycle && rawCycleCat && rawCycleCat !== 'all') {
          entries = entries.filter((pe) => isEmployeeMatchingCategoryFilter(pe.category, rawCycleCat));
        }
      } catch (err) {
        console.warn(`[Payroll] Populate error for cycle ${id}:`, err);
      }
    }

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

      const resolvedAbsences = pe.absences !== undefined && pe.absences !== null
        ? Number(pe.absences)
        : (customValues.absences !== undefined ? Number(customValues.absences) : (deductions.absences !== undefined ? Number(deductions.absences) : 0));

      const isViEmp = Boolean(
        (pe.category && (
          String(pe.category).toUpperCase().includes('VISITING') ||
          String(pe.category).toUpperCase().includes('PART-TIME') ||
          String(pe.category).toUpperCase().includes('PART TIME') ||
          String(pe.category).toUpperCase().includes('LECTURER') ||
          String(pe.category).toUpperCase() === 'VI'
        )) || 
        (pe.position && (
          String(pe.position).toUpperCase().includes('VISITING') ||
          String(pe.position).toUpperCase().includes('VI ') ||
          String(pe.position).toUpperCase().endsWith(' VI')
        )) ||
        (cycle && (
          String(cycle.categoryFilter || cycle.category_filter || '').toLowerCase().includes('visiting') ||
          String(cycle.name || '').toUpperCase().trim() === 'VI' ||
          String(cycle.name || '').toLowerCase().includes('visiting')
        ))
      );

      const isSemi = cycle?.type === 'semi-monthly';
      const viGovGsis = isViEmp ? Number((resolvedSal2nd * 0.12).toFixed(2)) : (Number(pe.govSecGsis) || 0);
      const viGovPh = isViEmp ? Number(((resolvedSal2nd * 0.05) / 2).toFixed(2)) : (Number(pe.govSecPh) || 0);
      const viGovHdmf = isViEmp ? (resolvedSal2nd > 0 ? (isSemi ? 100.00 : 200.00) : 0) : (Number(pe.govSecHdmf) || 0);
      const viGovEcip = isViEmp ? (resolvedSal2nd > 0 ? (isSemi ? 50.00 : 100.00) : 0) : (Number(pe.govSecEcip) || 0);

      const viGovOverrides = isViEmp ? {
        govSecGsis: viGovGsis,
        govSecPh: viGovPh,
        govSecHdmf: viGovHdmf,
        govSecEcip: viGovEcip
      } : {};

      return {
        ...pe,
        ...viGovOverrides,
        absences: resolvedAbsences,
        compSal2nd: resolvedSal2nd,
        basicPay: pe.basicPay || resolvedSal2nd,
        customValues: { ...deductions, ...customValues, compSal2nd: resolvedSal2nd, absences: resolvedAbsences, ...viGovOverrides },
        deductions: { ...deductions, absences: resolvedAbsences, ...viGovOverrides }
      };
    });

    res.json(formattedEntries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.post("/payroll-cycles/:id/sync-dtr", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const totals = await calculateNetSalary(id);
    broadcastRealtime("payroll_changed", { cycleId: id, source: "manual_sync_dtr" });
    res.json({ success: true, totals });
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
      WHERE (status = 'active' OR status IS NULL)
      AND id NOT IN (SELECT employeeId FROM payroll_entries WHERE cycleId = ?)
    `;
    const params: any[] = [id];

    const rawCat = cycle.categoryFilter || cycle.category_filter || ((cycle.name && (cycle.name.trim().toUpperCase() === 'VI' || cycle.name.toLowerCase().includes('visiting'))) ? 'visiting-instructor' : 'all');
    const catFilter = (rawCat || 'all').toLowerCase();
    if (catFilter === 'visiting-instructor' || catFilter === 'visiting instructor' || catFilter === 'visiting' || catFilter.includes('visiting')) {
      query += " AND (UPPER(category) LIKE '%VISITING%' OR UPPER(category) LIKE '%PART-TIME%' OR UPPER(category) LIKE '%PART TIME%' OR UPPER(category) LIKE '%LECTURER%' OR UPPER(category) = 'VI' OR UPPER(category) LIKE 'VI %' OR UPPER(category) LIKE '% VI') AND UPPER(category) NOT LIKE '%JOB ORDER%' AND UPPER(category) NOT LIKE '%JOB_ORDER%' AND UPPER(category) NOT LIKE '%JOB-ORDER%' AND UPPER(category) != 'JO'";
    } else if (catFilter === 'faculty-staff' || catFilter === 'faculty & staff' || catFilter === 'faculty_staff' || catFilter.includes('faculty')) {
      query += " AND (UPPER(category) LIKE '%FACULTY%' OR UPPER(category) LIKE '%STAFF%' OR UPPER(category) LIKE '%REGULAR%' OR UPPER(category) = 'PERMANENT') AND UPPER(category) NOT LIKE '%VISITING%' AND UPPER(category) NOT LIKE '%PART-TIME%' AND UPPER(category) NOT LIKE '%PART TIME%' AND UPPER(category) NOT LIKE '%LECTURER%' AND UPPER(category) NOT LIKE '%JOB ORDER%' AND UPPER(category) NOT LIKE '%JOB_ORDER%' AND UPPER(category) NOT LIKE '%JOB-ORDER%' AND UPPER(category) != 'JO' AND UPPER(category) != 'VI'";
    } else if (catFilter === 'job-order' || catFilter === 'job order' || catFilter === 'jo' || catFilter.includes('job')) {
      query += " AND (UPPER(category) LIKE '%JOB ORDER%' OR UPPER(category) LIKE '%JOB_ORDER%' OR UPPER(category) LIKE '%JOB-ORDER%' OR UPPER(category) = 'JO' OR UPPER(category) LIKE 'JO %' OR UPPER(category) LIKE '% JO') AND UPPER(category) NOT LIKE '%VISITING%'";
    } else if (catFilter !== 'all') {
      query += " AND (category = ? OR UPPER(category) = UPPER(?))";
      params.push(rawCat, rawCat);
    }

    if (cycle.campus && cycle.campus !== 'All Campuses') {
      const campusBase = cycle.campus.replace(/Campus/i, '').trim();
      query += " AND (campus = ? OR campus LIKE ? OR campus IS NULL OR campus = '')";
      params.push(cycle.campus, `%${campusBase}%`);
    }

    const available = await db.prepare(query).all(...params) as any[];
    const strictlyFiltered = available.filter((emp: any) => isEmployeeMatchingCategoryFilter(emp.category, rawCat));
    res.json(strictlyFiltered);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

payrollRouter.post("/payroll-cycles/:id/entries", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { employeeIds } = req.body;
    if (!Array.isArray(employeeIds)) return res.status(400).json({ error: "employeeIds array required" });

    const cycle = await db.prepare("SELECT * FROM payroll_cycles WHERE id = ?").get(id) as any;
    if (!cycle) return res.status(404).json({ error: "Cycle not found" });

    const cycleCat = cycle.categoryFilter || cycle.category_filter || ((cycle.name && (cycle.name.trim().toUpperCase() === 'VI' || cycle.name.toLowerCase().includes('visiting'))) ? 'visiting-instructor' : 'all');

    let addedCount = 0;
    for (const empId of employeeIds) {
      const emp = await db.prepare("SELECT * FROM employees WHERE id = ?").get(empId) as any;
      if (emp && isEmployeeMatchingCategoryFilter(emp.category, cycleCat)) {
        // Check if already in cycle
        const existing = await db.prepare("SELECT id FROM payroll_entries WHERE cycleId = ? AND employeeId = ?").get(id, emp.id);
        if (!existing) {
          const entryId = `entry-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          const empName = `${emp.lastName ? emp.lastName + ', ' : ''}${emp.firstName || ''} ${emp.mi ? emp.mi + '.' : ''}`.trim();
          const basicPay = cycle?.type === 'semi-monthly' ? (Number(emp.basicSalary || 0) / 2) : Number(emp.basicSalary || 0);
          await db.prepare(`
            INSERT INTO payroll_entries (id, cycleId, employeeId, employeeName, basicPay, grossPay, netPay, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
          `).run(entryId, id, emp.id, empName, basicPay || 0, basicPay || 0, basicPay || 0);
          addedCount++;
        }
      }
    }

    await calculateNetSalary(id);
    res.json({ success: true, count: addedCount });
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

    const cycle = await db.prepare("SELECT * FROM payroll_cycles WHERE id = ?").get(id) as any;
    if (!cycle) return res.status(404).json({ error: "Cycle not found" });

    // Check if already in cycle
    const existing = await db.prepare("SELECT id FROM payroll_entries WHERE cycleId = ? AND employeeId = ?").get(id, employeeId);
    if (existing) return res.json({ success: true, message: "Employee already in cycle" });

    const emp = await db.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId) as any;
    if (!emp) return res.status(404).json({ error: "Employee not found" });

    const cycleCat = cycle.categoryFilter || cycle.category_filter || ((cycle.name && (cycle.name.trim().toUpperCase() === 'VI' || cycle.name.toLowerCase().includes('visiting'))) ? 'visiting-instructor' : 'all');

    // Strict validation: Only allow employees matching the cycle's category
    if (!isEmployeeMatchingCategoryFilter(emp.category, cycleCat)) {
      const targetCategoryName = cycleCat === 'visiting-instructor' ? 'Visiting Instructor' :
        cycleCat === 'faculty-staff' ? 'Faculty & Staff' :
        cycleCat === 'job-order' ? 'Job Order' : cycleCat;
      return res.status(400).json({ 
        error: `Cannot enroll "${emp.firstName || ''} ${emp.lastName || ''}" (${emp.category || 'Regular'}). This payroll cycle is restricted to "${targetCategoryName}" only.` 
      });
    }

    const entryId = `entry-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const empName = `${emp.lastName ? emp.lastName + ', ' : ''}${emp.firstName || ''} ${emp.mi ? emp.mi + '.' : ''}`.trim();
    const basicPay = cycle?.type === 'semi-monthly' ? (Number(emp.basicSalary || 0) / 2) : Number(emp.basicSalary || 0);

    await db.prepare(`
      INSERT INTO payroll_entries (id, cycleId, employeeId, employeeName, basicPay, grossPay, netPay, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(entryId, id, emp.id, empName, basicPay || 0, basicPay || 0, basicPay || 0);

    await calculateNetSalary(id);
    await logAudit(req, "ADD_EMPLOYEE_TO_CYCLE", `Added employee ${empName} (${emp.category}) to cycle ${id}`);
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
    const { basicPay, compSal2nd, overtime, bonuses, allowances, otHours, teachingHours, custom_values_json, customValues, absences } = req.body;

    const entry = await db.prepare("SELECT * FROM payroll_entries WHERE id = ?").get(id) as any;
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    const cycle = await db.prepare("SELECT * FROM payroll_cycles WHERE id = ?").get(entry.cycleId) as any;

    const isViEmp = Boolean(
      (entry.category && (
        String(entry.category).toUpperCase().includes('VISITING') ||
        String(entry.category).toUpperCase().includes('PART-TIME') ||
        String(entry.category).toUpperCase().includes('PART TIME') ||
        String(entry.category).toUpperCase().includes('LECTURER') ||
        String(entry.category).toUpperCase() === 'VI'
      )) || 
      (entry.position && (
        String(entry.position).toUpperCase().includes('VISITING') ||
        String(entry.position).toUpperCase().includes('VI ') ||
        String(entry.position).toUpperCase().endsWith(' VI')
      )) ||
      (cycle && (
        String(cycle.categoryFilter || cycle.category_filter || '').toLowerCase().includes('visiting') ||
        String(cycle.name || '').toUpperCase().trim() === 'VI' ||
        String(cycle.name || '').toLowerCase().includes('visiting')
      ))
    );

    const effectiveSalary = compSal2nd !== undefined 
      ? Number(compSal2nd) 
      : (customValues?.compSal2nd !== undefined 
          ? Number(customValues.compSal2nd) 
          : (basicPay !== undefined ? Number(basicPay) : Number(entry.basicPay || entry.compSal2nd || 0)));

    let effectiveCustomValues = { ...(customValues && typeof customValues === 'object' ? customValues : {}) };
    if (compSal2nd !== undefined) {
      effectiveCustomValues.compSal2nd = Number(compSal2nd);
    }
    if (basicPay !== undefined) {
      effectiveCustomValues.basicPay = Number(basicPay);
    }

    if (isViEmp && (compSal2nd !== undefined || basicPay !== undefined || customValues?.compSal2nd !== undefined)) {
      const isSemi = cycle?.type === 'semi-monthly';
      const viGovGsis = Number((effectiveSalary * 0.12).toFixed(2));
      const viGovPh = Number(((effectiveSalary * 0.05) / 2).toFixed(2));
      const viGovHdmf = effectiveSalary > 0 ? (isSemi ? 100.00 : 200.00) : 0;
      const viGovEcip = effectiveSalary > 0 ? (isSemi ? 50.00 : 100.00) : 0;
      effectiveCustomValues.govSecGsis = viGovGsis;
      effectiveCustomValues.govSecPh = viGovPh;
      effectiveCustomValues.govSecHdmf = viGovHdmf;
      effectiveCustomValues.govSecEcip = viGovEcip;
    }

    let updatedCustomJson = custom_values_json;
    if (Object.keys(effectiveCustomValues).length > 0) {
      let existingCustom = {};
      if (entry.custom_values_json) {
        try {
          existingCustom = typeof entry.custom_values_json === 'string' ? JSON.parse(entry.custom_values_json) : entry.custom_values_json;
        } catch {
          existingCustom = {};
        }
      }
      updatedCustomJson = JSON.stringify({ ...existingCustom, ...effectiveCustomValues });
    }

    const resolvedAbsences = absences !== undefined ? Number(absences) : (effectiveCustomValues?.absences !== undefined ? Number(effectiveCustomValues.absences) : entry.absences);
    const resolvedBasicPay = compSal2nd !== undefined ? Number(compSal2nd) : (basicPay !== undefined ? Number(basicPay) : entry.basicPay);
    const resolvedCompSal2nd = compSal2nd !== undefined ? Number(compSal2nd) : (basicPay !== undefined ? Number(basicPay) : (entry.compSal2nd || entry.basicPay));

    await db.prepare(`
      UPDATE payroll_entries SET
        basicPay = ?, compSal2nd = ?, overtime = ?, bonuses = ?, allowances = ?, otHours = ?,
        teachingHours = ?, absences = ?, custom_values_json = ?
      WHERE id = ?
    `).run(
      resolvedBasicPay !== undefined ? resolvedBasicPay : entry.basicPay,
      resolvedCompSal2nd !== undefined ? resolvedCompSal2nd : entry.compSal2nd,
      overtime !== undefined ? overtime : entry.overtime,
      bonuses !== undefined ? bonuses : entry.bonuses,
      allowances !== undefined ? allowances : entry.allowances,
      otHours !== undefined ? otHours : entry.otHours,
      teachingHours !== undefined ? teachingHours : entry.teachingHours,
      resolvedAbsences !== undefined ? resolvedAbsences : entry.absences,
      updatedCustomJson !== undefined ? updatedCustomJson : entry.custom_values_json,
      id
    );

    const customOverrides = Object.keys(effectiveCustomValues).length > 0 ? { [id]: effectiveCustomValues } : undefined;
    await calculateNetSalary(entry.cycleId, entry.employeeId, customOverrides);

    // Bidirectional sync: sync to deductions table
    if (customValues && typeof customValues === 'object') {
      await syncPayrollDeductionsToDeductionsTable(entry.employeeId, customValues);
    }

    broadcastRealtime("payroll_changed", { cycleId: entry.cycleId, entryId: id, source: "updateEntry" });

    const updatedCycle = await db.prepare('SELECT "totalGross", "totalDeductions", "totalNet" FROM payroll_cycles WHERE id = ?').get(entry.cycleId) as any;

    res.json({ 
      success: true,
      cycleTotals: updatedCycle ? {
        totalGross: Number(updatedCycle.totalGross || 0),
        totalDeductions: Number(updatedCycle.totalDeductions || 0),
        totalNet: Number(updatedCycle.totalNet || 0)
      } : undefined
    });
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
    // Only perform auto-sync if records table is completely empty
    try {
      const recCount = await db.prepare("SELECT COUNT(*) as count FROM payroll_records").get() as any;
      if (!recCount || Number(recCount.count) === 0) {
        await syncAllCyclesToRecords();
      }
    } catch {}

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
