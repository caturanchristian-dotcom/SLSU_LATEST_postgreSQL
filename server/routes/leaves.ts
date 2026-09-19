import { Router } from "express";
import { db, logAudit } from "../db/schema.js";
import { calculateNetSalary } from "../services/payrollCalculator.js";
import { broadcastRealtime } from "../index.js";
import { resolveEmployeeId } from "./dtr.js";

export const leavesRouter = Router();

// Debounced background payroll recalculation when leave status changes
let syncPayrollTimeout: NodeJS.Timeout | null = null;
function triggerBackgroundPayrollSync() {
  if (syncPayrollTimeout) clearTimeout(syncPayrollTimeout);
  syncPayrollTimeout = setTimeout(async () => {
    try {
      const activeCycles = await db.prepare(
        "SELECT id FROM payroll_cycles WHERE status NOT IN ('disbursed', 'completed', 'archived') OR status IS NULL"
      ).all() as any[];
      for (const cycle of activeCycles) {
        await calculateNetSalary(cycle.id);
      }
      broadcastRealtime("payroll_changed", { source: "leaves" });
      broadcastRealtime("leaves_changed", { source: "leaves" });
      broadcastRealtime("leave_requests_changed", { source: "leaves" });
      broadcastRealtime("dtr_changed", { source: "leaves" });
    } catch (err) {
      console.error("[Leaves] Error during background payroll recalculation:", err);
    }
  }, 150);
}

/**
 * Calculates working days (Mon-Fri) between two dates inclusive (timezone-safe)
 */
export function calculateWorkingDays(startDateStr: string, endDateStr: string): number {
  if (!startDateStr || !endDateStr) return 1.0;
  const sClean = String(startDateStr).split('T')[0];
  const eClean = String(endDateStr).split('T')[0];
  const sParts = sClean.split('-').map(Number);
  const eParts = eClean.split('-').map(Number);

  if (sParts.length !== 3 || eParts.length !== 3) return 1.0;
  const start = new Date(sParts[0], sParts[1] - 1, sParts[2]);
  const end = new Date(eParts[0], eParts[1] - 1, eParts[2]);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 1.0;

  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day >= 1 && day <= 5) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count > 0 ? count : 1.0;
}

/**
 * Resolves current user info and role from request headers
 */
async function getUserAuth(req: any) {
  const role = String(req.headers["x-user-role"] || req.user?.role || "employee").toLowerCase().trim();
  const userId = String(req.headers["x-user-id"] || req.user?.id || "").trim();
  const userEmail = String(req.headers["x-user-email"] || req.user?.email || "").toLowerCase().trim();

  let resolvedEmp: any = null;
  if (userId || userEmail) {
    resolvedEmp = await db.prepare(`
      SELECT * FROM employees 
      WHERE (id = ? OR "employeeId" = ? OR LOWER(email) = ?)
      LIMIT 1
    `).get(userId, userId, userEmail).catch(() => null) as any;
  }

  return {
    role,
    userId,
    userEmail,
    employee: resolvedEmp,
    employeeId: resolvedEmp ? resolvedEmp.id : userId
  };
}

/**
 * Finds all employees authorized under a department head
 */
async function getDepartmentHeadAuthorizedEmployeeIds(userId: string, userEmail: string, employeeId?: string): Promise<{
  authorizedEmployeeIds: Set<string>;
  departmentNames: string[];
  departmentIds: string[];
}> {
  const authorizedIds = new Set<string>();
  const departmentNames: string[] = [];
  const departmentIds: string[] = [];

  try {
    const candidateIds = [userId, userEmail];
    if (employeeId) candidateIds.push(employeeId);

    // 1. Check departments table
    const depts = await db.prepare(`
      SELECT id, name, code, "departmentHeadId" 
      FROM departments
    `).all() as any[];

    for (const d of depts) {
      const headId = String(d.departmentHeadId || '').trim().toLowerCase();
      if (headId && candidateIds.some(c => c && c.toLowerCase() === headId)) {
        departmentIds.push(d.id);
        departmentNames.push(d.name || d.code);
      }
    }

    // 2. Check teaching_departments table
    const tDepts = await db.prepare(`
      SELECT id, name, code, "departmentHeadId" 
      FROM teaching_departments
    `).all() as any[];

    for (const td of tDepts) {
      const headId = String(td.departmentHeadId || '').trim().toLowerCase();
      if (headId && candidateIds.some(c => c && c.toLowerCase() === headId)) {
        departmentIds.push(td.id);
        departmentNames.push(td.name || td.code);
      }
    }

    // 3. Find employees in these departments
    if (departmentIds.length > 0) {
      const placeholders = departmentIds.map(() => '?').join(',');
      const emps = await db.prepare(`
        SELECT id FROM employees 
        WHERE "teachingDepartmentId" IN (${placeholders}) 
           OR "departmentId" IN (${placeholders})
      `).all(...departmentIds, ...departmentIds) as any[];

      for (const e of emps) {
        authorizedIds.add(e.id);
      }
    }

    // Department Head can also see own requests
    if (employeeId) {
      authorizedIds.add(employeeId);
    }
    if (userId) {
      authorizedIds.add(userId);
    }
  } catch (err) {
    console.error("[Leaves] Error retrieving department head authorized employees:", err);
  }

  return {
    authorizedEmployeeIds: authorizedIds,
    departmentNames,
    departmentIds
  };
}

// ==========================================
// 1. LEAVE TYPES (CRUD)
// ==========================================

// GET /api/leave-types - List all leave types
leavesRouter.get("/leave-types", async (req: any, res: any) => {
  try {
    const { status } = req.query;
    let query = "SELECT * FROM leave_types";
    const params: any[] = [];

    if (status) {
      query += " WHERE status = ?";
      params.push(status);
    } else {
      query += " WHERE status = 'active'";
    }
    query += " ORDER BY name ASC";

    const types = await db.prepare(query).all(...params) as any[];
    res.json(types || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leave-types - Create new leave type (Admin only)
leavesRouter.post("/leave-types", async (req: any, res: any) => {
  try {
    const auth = await getUserAuth(req);
    if (auth.role !== "admin" && auth.role !== "super_admin" && auth.role !== "payroll_officer") {
      return res.status(403).json({ error: "Unauthorized: Only administrators can create leave types" });
    }

    const {
      name,
      code,
      description,
      daysAllowed,
      isPaid,
      requiresAttachment,
      applicableGender,
      status
    } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: "Leave type name and code are required" });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const existing = await db.prepare("SELECT id FROM leave_types WHERE UPPER(code) = ?").get(cleanCode) as any;
    if (existing) {
      return res.status(400).json({ error: `Leave type with code '${cleanCode}' already exists` });
    }

    const id = `lt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    await db.prepare(`
      INSERT INTO leave_types (
        id, name, code, description, "daysAllowed", "isPaid",
        "requiresAttachment", "applicableGender", status, "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      id,
      String(name).trim(),
      cleanCode,
      description || null,
      Number(daysAllowed) || 15.0,
      isPaid === false || isPaid === 0 ? 0 : 1,
      requiresAttachment ? 1 : 0,
      applicableGender || "ALL",
      status || "active"
    );

    const created = await db.prepare("SELECT * FROM leave_types WHERE id = ?").get(id);
    await logAudit(req, "CREATE_LEAVE_TYPE", JSON.stringify({ id, name, code: cleanCode }));
    broadcastRealtime("leaves_changed", { type: "leave_type_created", id });

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/leave-types/:id - Update leave type (Admin only)
leavesRouter.put("/leave-types/:id", async (req: any, res: any) => {
  try {
    const auth = await getUserAuth(req);
    if (auth.role !== "admin" && auth.role !== "super_admin" && auth.role !== "payroll_officer") {
      return res.status(403).json({ error: "Unauthorized: Only administrators can edit leave types" });
    }

    const { id } = req.params;
    const {
      name,
      code,
      description,
      daysAllowed,
      isPaid,
      requiresAttachment,
      applicableGender,
      status
    } = req.body;

    const existing = await db.prepare("SELECT * FROM leave_types WHERE id = ?").get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: "Leave type not found" });
    }

    const cleanCode = code ? String(code).trim().toUpperCase() : existing.code;
    await db.prepare(`
      UPDATE leave_types SET
        name = COALESCE(?, name),
        code = COALESCE(?, code),
        description = COALESCE(?, description),
        "daysAllowed" = COALESCE(?, "daysAllowed"),
        "isPaid" = COALESCE(?, "isPaid"),
        "requiresAttachment" = COALESCE(?, "requiresAttachment"),
        "applicableGender" = COALESCE(?, "applicableGender"),
        status = COALESCE(?, status),
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name ? String(name).trim() : null,
      cleanCode,
      description !== undefined ? description : null,
      daysAllowed !== undefined ? Number(daysAllowed) : null,
      isPaid !== undefined ? (isPaid === false || isPaid === 0 ? 0 : 1) : null,
      requiresAttachment !== undefined ? (requiresAttachment ? 1 : 0) : null,
      applicableGender || null,
      status || null,
      id
    );

    const updated = await db.prepare("SELECT * FROM leave_types WHERE id = ?").get(id);
    await logAudit(req, "UPDATE_LEAVE_TYPE", JSON.stringify({ id, name, code: cleanCode }));
    broadcastRealtime("leaves_changed", { type: "leave_type_updated", id });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/leave-types/:id - Soft-delete or remove leave type
leavesRouter.delete("/leave-types/:id", async (req: any, res: any) => {
  try {
    const auth = await getUserAuth(req);
    if (auth.role !== "admin" && auth.role !== "super_admin") {
      return res.status(403).json({ error: "Unauthorized: Only administrators can delete leave types" });
    }

    const { id } = req.params;
    // Check if there are requests using this leave type
    const used = await db.prepare('SELECT id FROM leave_requests WHERE "leaveTypeId" = ? LIMIT 1').get(id) as any;
    if (used) {
      // Soft delete by setting status to inactive
      await db.prepare("UPDATE leave_types SET status = 'inactive', \"updatedAt\" = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      return res.json({ message: "Leave type has associated requests; status set to inactive", id, softDeleted: true });
    }

    await db.prepare("DELETE FROM leave_types WHERE id = ?").run(id);
    await logAudit(req, "DELETE_LEAVE_TYPE", JSON.stringify({ id }));
    broadcastRealtime("leaves_changed", { type: "leave_type_deleted", id });

    res.json({ message: "Leave type deleted successfully", id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. LEAVE BALANCES
// ==========================================

// GET /api/leave-balances - List leave balances
leavesRouter.get("/leave-balances", async (req: any, res: any) => {
  try {
    const auth = await getUserAuth(req);
    const { employeeId, year } = req.query;
    const targetYear = Number(year) || new Date().getFullYear();

    let query = `
      SELECT b.*,
             lt.name as "leaveTypeName",
             lt.code as "leaveTypeCode",
             lt."isPaid",
             lt."daysAllowed" as "defaultDaysAllowed",
             e."firstName",
             e."lastName",
             e."employeeId" as "employeeNo",
             e.campus,
             e.category,
             COALESCE(td.name, d.name, '') as "departmentName"
      FROM leave_balances b
      JOIN leave_types lt ON b."leaveTypeId" = lt.id
      JOIN employees e ON b."employeeId" = e.id
      LEFT JOIN teaching_departments td ON e."teachingDepartmentId" = td.id
      LEFT JOIN departments d ON e."departmentId" = d.id
      WHERE b.year = ?
    `;
    const params: any[] = [targetYear];

    // Scoping
    if (auth.role === "employee") {
      const empId = auth.employee ? auth.employee.id : auth.userId;
      query += ` AND b."employeeId" = ?`;
      params.push(empId);
    } else if (auth.role === "department_head") {
      const dh = await getDepartmentHeadAuthorizedEmployeeIds(auth.userId, auth.userEmail, auth.employee?.id);
      if (dh.authorizedEmployeeIds.size === 0) {
        return res.json([]);
      }
      const pList = Array.from(dh.authorizedEmployeeIds);
      query += ` AND b."employeeId" IN (${pList.map(() => '?').join(',')})`;
      params.push(...pList);
    } else if (employeeId) {
      const resolved = await resolveEmployeeId(employeeId);
      query += ` AND (b."employeeId" = ? OR b."employeeId" = ?)`;
      params.push(resolved || employeeId, employeeId);
    }

    query += ` ORDER BY e."lastName" ASC, lt.name ASC`;
    const balances = await db.prepare(query).all(...params) as any[];
    res.json(balances || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leave-balances/generate - Generate/refresh balances for active employees
leavesRouter.post("/leave-balances/generate", async (req: any, res: any) => {
  try {
    const auth = await getUserAuth(req);
    if (auth.role !== "admin" && auth.role !== "super_admin" && auth.role !== "payroll_officer") {
      return res.status(403).json({ error: "Unauthorized: Only administrators can generate leave balances" });
    }

    const { year } = req.body;
    const targetYear = Number(year) || new Date().getFullYear();

    const employees = await db.prepare("SELECT id, gender FROM employees WHERE status = 'active' OR status IS NULL").all() as any[];
    const leaveTypes = await db.prepare("SELECT * FROM leave_types WHERE status = 'active'").all() as any[];

    let generatedCount = 0;
    for (const emp of employees) {
      for (const lt of leaveTypes) {
        const empGender = String(emp.gender || 'MALE').toUpperCase();
        if (lt.applicableGender === 'FEMALE' && empGender !== 'FEMALE') continue;
        if (lt.applicableGender === 'MALE' && empGender !== 'MALE') continue;

        const existing = await db.prepare(`
          SELECT id FROM leave_balances 
          WHERE "employeeId" = ? AND "leaveTypeId" = ? AND year = ?
        `).get(emp.id, lt.id, targetYear) as any;

        if (!existing) {
          const balId = `bal-${emp.id}-${lt.code}-${targetYear}`;
          const allocated = Number(lt.daysAllowed || 15.0);
          await db.prepare(`
            INSERT INTO leave_balances (
              id, "employeeId", "leaveTypeId", year, "allocatedDays", "usedDays", "pendingDays", "remainingDays"
            ) VALUES (?, ?, ?, ?, ?, 0.00, 0.00, ?)
            ON CONFLICT (id) DO NOTHING
          `).run(balId, emp.id, lt.id, targetYear, allocated, allocated);
          generatedCount++;
        }
      }
    }

    res.json({ message: `Successfully allocated balances for ${employees.length} employees (${generatedCount} new allocations)`, count: generatedCount, year: targetYear });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/leave-balances/:id - Adjust leave balance (Admin only)
leavesRouter.put("/leave-balances/:id", async (req: any, res: any) => {
  try {
    const auth = await getUserAuth(req);
    if (auth.role !== "admin" && auth.role !== "super_admin" && auth.role !== "payroll_officer") {
      return res.status(403).json({ error: "Unauthorized: Only administrators can adjust leave balances" });
    }

    const { id } = req.params;
    const { allocatedDays, usedDays, pendingDays, remainingDays } = req.body;

    const existing = await db.prepare("SELECT * FROM leave_balances WHERE id = ?").get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: "Leave balance record not found" });
    }

    const newAllocated = allocatedDays !== undefined ? Number(allocatedDays) : Number(existing.allocatedDays);
    const newUsed = usedDays !== undefined ? Number(usedDays) : Number(existing.usedDays);
    const newPending = pendingDays !== undefined ? Number(pendingDays) : Number(existing.pendingDays);
    const newRemaining = remainingDays !== undefined ? Number(remainingDays) : (newAllocated - newUsed - newPending);

    await db.prepare(`
      UPDATE leave_balances SET
        "allocatedDays" = ?,
        "usedDays" = ?,
        "pendingDays" = ?,
        "remainingDays" = ?,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newAllocated, newUsed, newPending, newRemaining, id);

    const updated = await db.prepare("SELECT * FROM leave_balances WHERE id = ?").get(id);
    await logAudit(req, "ADJUST_LEAVE_BALANCE", JSON.stringify({ id, newAllocated, newUsed, newRemaining }));
    broadcastRealtime("leaves_changed", { type: "balance_adjusted", id });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. LEAVE REQUESTS (CRUD & LIFECYCLE)
// ==========================================

// GET /api/leave-requests - List leave requests with filters and role scoping
leavesRouter.get(["/leave-requests", "/leaves", "/leave-applications"], async (req: any, res: any) => {
  try {
    const auth = await getUserAuth(req);
    const {
      employeeId,
      departmentId,
      leaveTypeId,
      status,
      startDate,
      endDate,
      search,
      year
    } = req.query;

    let query = `
      SELECT r.*,
             COALESCE(r."leaveType", lt.name) as "leaveTypeName",
             COALESCE(lt.code, '') as "leaveTypeCode",
             COALESCE(lt."isPaid", 1) as "isPaid",
             COALESCE(lt."requiresAttachment", 0) as "requiresAttachment",
             e."firstName",
             e."lastName",
             e."employeeId" as "employeeNo",
             e.campus,
             e.category,
             e."profileImage" as avatar,
             COALESCE(td.name, d.name, '') as "departmentName"
      FROM leave_requests r
      LEFT JOIN leave_types lt ON (r."leaveTypeId" = lt.id OR LOWER(r."leaveType") = LOWER(lt.name) OR LOWER(r."leaveType") = LOWER(lt.code))
      LEFT JOIN employees e ON r."employeeId" = e.id
      LEFT JOIN teaching_departments td ON e."teachingDepartmentId" = td.id
      LEFT JOIN departments d ON e."departmentId" = d.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Role-based scoping
    if (auth.role === "employee") {
      const empId = auth.employee ? auth.employee.id : auth.userId;
      query += ` AND (r."employeeId" = ? OR r."employeeId" = ?)`;
      params.push(empId, auth.userId);
    } else if (auth.role === "department_head") {
      const dh = await getDepartmentHeadAuthorizedEmployeeIds(auth.userId, auth.userEmail, auth.employee?.id);
      if (dh.authorizedEmployeeIds.size === 0) {
        return res.json([]);
      }
      const pList = Array.from(dh.authorizedEmployeeIds);
      query += ` AND r."employeeId" IN (${pList.map(() => '?').join(',')})`;
      params.push(...pList);
    }

    // Explicit query filters
    if (employeeId) {
      const resolved = await resolveEmployeeId(employeeId);
      query += ` AND (r."employeeId" = ? OR r."employeeId" = ?)`;
      params.push(resolved || employeeId, employeeId);
    }

    if (status && status !== "all") {
      query += ` AND LOWER(r.status) = LOWER(?)`;
      params.push(status);
    }

    if (leaveTypeId) {
      query += ` AND (r."leaveTypeId" = ? OR lt.code = ?)`;
      params.push(leaveTypeId, leaveTypeId);
    }

    if (startDate) {
      query += ` AND r."endDate" >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND r."startDate" <= ?`;
      params.push(endDate);
    }

    if (year) {
      const y = Number(year);
      query += ` AND (r."startDate" >= ? AND r."startDate" <= ?)`;
      params.push(`${y}-01-01`, `${y}-12-31`);
    }

    if (departmentId && departmentId !== "all") {
      query += ` AND (e."teachingDepartmentId" = ? OR e."departmentId" = ?)`;
      params.push(departmentId, departmentId);
    }

    if (search) {
      const term = `%${String(search).toLowerCase()}%`;
      query += ` AND (
        LOWER(e."firstName") LIKE ? OR
        LOWER(e."lastName") LIKE ? OR
        LOWER(e."employeeId") LIKE ? OR
        LOWER(r.reason) LIKE ? OR
        LOWER(r."leaveType") LIKE ?
      )`;
      params.push(term, term, term, term, term);
    }

    query += ` ORDER BY r."createdAt" DESC`;

    const requests = await db.prepare(query).all(...params) as any[];
    res.json(requests || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leave-requests/summary - Summary metrics and reporting
leavesRouter.get(["/leave-requests/summary", "/leaves/summary", "/leave-applications/summary"], async (req: any, res: any) => {
  try {
    const auth = await getUserAuth(req);
    const { year } = req.query;
    const targetYear = Number(year) || new Date().getFullYear();

    let scopeWhere = "WHERE (r.\"startDate\" >= ? AND r.\"startDate\" <= ?)";
    const params: any[] = [`${targetYear}-01-01`, `${targetYear}-12-31`];

    if (auth.role === "employee") {
      const empId = auth.employee ? auth.employee.id : auth.userId;
      scopeWhere += ` AND (r."employeeId" = ? OR r."employeeId" = ?)`;
      params.push(empId, auth.userId);
    } else if (auth.role === "department_head") {
      const dh = await getDepartmentHeadAuthorizedEmployeeIds(auth.userId, auth.userEmail, auth.employee?.id);
      if (dh.authorizedEmployeeIds.size === 0) {
        return res.json({
          total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0, totalDays: 0, byType: [], byDepartment: []
        });
      }
      const pList = Array.from(dh.authorizedEmployeeIds);
      scopeWhere += ` AND r."employeeId" IN (${pList.map(() => '?').join(',')})`;
      params.push(...pList);
    }

    const allRequests = await db.prepare(`
      SELECT r.*,
             COALESCE(lt.name, r."leaveType") as "leaveTypeName",
             COALESCE(td.name, d.name, 'Unassigned') as "departmentName"
      FROM leave_requests r
      LEFT JOIN leave_types lt ON r."leaveTypeId" = lt.id
      LEFT JOIN employees e ON r."employeeId" = e.id
      LEFT JOIN teaching_departments td ON e."teachingDepartmentId" = td.id
      LEFT JOIN departments d ON e."departmentId" = d.id
      ${scopeWhere}
    `).all(...params) as any[];

    const total = allRequests.length;
    const pending = allRequests.filter(r => r.status === 'pending').length;
    const approved = allRequests.filter(r => r.status === 'approved').length;
    const rejected = allRequests.filter(r => r.status === 'rejected').length;
    const cancelled = allRequests.filter(r => r.status === 'cancelled').length;
    const totalApprovedDays = allRequests
      .filter(r => r.status === 'approved')
      .reduce((sum, r) => sum + Number(r.daysCount || 0), 0);

    // Group by leave type
    const byTypeMap: { [key: string]: { name: string; count: number; days: number } } = {};
    for (const r of allRequests) {
      const tName = r.leaveTypeName || r.leaveType || 'Other';
      if (!byTypeMap[tName]) byTypeMap[tName] = { name: tName, count: 0, days: 0 };
      byTypeMap[tName].count++;
      if (r.status === 'approved') byTypeMap[tName].days += Number(r.daysCount || 0);
    }

    // Group by department
    const byDeptMap: { [key: string]: { name: string; count: number; approved: number } } = {};
    for (const r of allRequests) {
      const dName = r.departmentName || 'General';
      if (!byDeptMap[dName]) byDeptMap[dName] = { name: dName, count: 0, approved: 0 };
      byDeptMap[dName].count++;
      if (r.status === 'approved') byDeptMap[dName].approved++;
    }

    res.json({
      year: targetYear,
      total,
      pending,
      approved,
      rejected,
      cancelled,
      totalApprovedDays,
      byType: Object.values(byTypeMap),
      byDepartment: Object.values(byDeptMap)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leave-requests/:id - Single leave request details
leavesRouter.get(["/leave-requests/:id", "/leaves/:id", "/leave-applications/:id"], async (req: any, res: any) => {
  try {
    const auth = await getUserAuth(req);
    const { id } = req.params;

    const request = await db.prepare(`
      SELECT r.*,
             COALESCE(r."leaveType", lt.name) as "leaveTypeName",
             COALESCE(lt.code, '') as "leaveTypeCode",
             COALESCE(lt."isPaid", 1) as "isPaid",
             COALESCE(lt."requiresAttachment", 0) as "requiresAttachment",
             e."firstName",
             e."lastName",
             e."employeeId" as "employeeNo",
             e.email,
             e.campus,
             COALESCE(td.name, d.name, '') as "departmentName"
      FROM leave_requests r
      LEFT JOIN leave_types lt ON (r."leaveTypeId" = lt.id OR LOWER(r."leaveType") = LOWER(lt.name) OR LOWER(r."leaveType") = LOWER(lt.code))
      LEFT JOIN employees e ON r."employeeId" = e.id
      LEFT JOIN teaching_departments td ON e."teachingDepartmentId" = td.id
      LEFT JOIN departments d ON e."departmentId" = d.id
      WHERE r.id = ?
    `).get(id) as any;

    if (!request) {
      return res.status(404).json({ error: "Leave request not found" });
    }

    // Scope check
    if (auth.role === "employee") {
      const empId = auth.employee ? auth.employee.id : auth.userId;
      if (request.employeeId !== empId && request.employeeId !== auth.userId) {
        return res.status(403).json({ error: "Unauthorized: You can only view your own leave requests" });
      }
    } else if (auth.role === "department_head") {
      const dh = await getDepartmentHeadAuthorizedEmployeeIds(auth.userId, auth.userEmail, auth.employee?.id);
      if (!dh.authorizedEmployeeIds.has(request.employeeId)) {
        return res.status(403).json({ error: "Unauthorized: You can only view leave requests for employees under your department" });
      }
    }

    res.json(request);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leave-requests - Submit a new leave request
leavesRouter.post(["/leave-requests", "/leaves", "/leave-applications"], async (req: any, res: any) => {
  try {
    const auth = await getUserAuth(req);
    const {
      employeeId,
      leaveTypeId,
      leaveType,
      startDate,
      endDate,
      reason,
      attachmentUrl,
      daysCount: userDaysCount
    } = req.body;

    // Determine target employee
    let targetEmpId = employeeId;
    if (auth.role === "employee") {
      // Employees can only submit for themselves
      targetEmpId = auth.employee ? auth.employee.id : auth.userId;
    } else if (!targetEmpId) {
      targetEmpId = auth.employee ? auth.employee.id : auth.userId;
    }

    if (!targetEmpId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Start date and end date are required" });
    }

    // Calculate working days
    const computedDays = calculateWorkingDays(startDate, endDate);
    const finalDays = userDaysCount !== undefined ? Math.max(0.5, Number(userDaysCount)) : computedDays;

    // Resolve leave type (support both standard types and custom input)
    let resolvedTypeId = leaveTypeId || null;
    let resolvedTypeName = (leaveType && String(leaveType).trim()) || "";

    if (resolvedTypeId) {
      const lt = await db.prepare("SELECT * FROM leave_types WHERE id = ?").get(resolvedTypeId) as any;
      if (lt) {
        // If client did not explicitly provide a custom name, use the leave type's official name
        if (!resolvedTypeName) {
          resolvedTypeName = lt.name;
        }
        if (lt.requiresAttachment && !attachmentUrl) {
          return res.status(400).json({ error: `Medical or supporting attachment is required for ${lt.name}` });
        }
      } else {
        resolvedTypeId = null;
      }
    } else if (resolvedTypeName) {
      const lt = await db.prepare("SELECT * FROM leave_types WHERE LOWER(name) = LOWER(?) OR UPPER(code) = UPPER(?)").get(resolvedTypeName, resolvedTypeName) as any;
      if (lt) {
        resolvedTypeId = lt.id;
        if (lt.requiresAttachment && !attachmentUrl) {
          return res.status(400).json({ error: `Supporting attachment is required for ${lt.name}` });
        }
      }
    }

    if (!resolvedTypeName) {
      resolvedTypeName = "Vacation Leave";
    }

    const reqId = `leave-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    // Insert into leave_requests
    await db.prepare(`
      INSERT INTO leave_requests (
        id, "employeeId", "leaveTypeId", "leaveType", "startDate", "endDate", "daysCount",
        reason, status, "attachmentUrl", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      reqId,
      targetEmpId,
      resolvedTypeId,
      resolvedTypeName,
      startDate,
      endDate,
      finalDays,
      reason || "",
      attachmentUrl || null
    );

    // Synchronize to leave_applications table
    try {
      await db.prepare(`
        INSERT INTO leave_applications (
          id, "employeeId", "leaveTypeId", "leaveType", "startDate", "endDate", "daysCount",
          reason, status, "attachmentUrl", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          "leaveTypeId" = EXCLUDED."leaveTypeId",
          "leaveType" = EXCLUDED."leaveType",
          "startDate" = EXCLUDED."startDate",
          "endDate" = EXCLUDED."endDate",
          "daysCount" = EXCLUDED."daysCount",
          reason = EXCLUDED.reason,
          status = EXCLUDED.status,
          "attachmentUrl" = EXCLUDED."attachmentUrl",
          "updatedAt" = CURRENT_TIMESTAMP
      `).run(
        reqId,
        targetEmpId,
        resolvedTypeId,
        resolvedTypeName,
        startDate,
        endDate,
        finalDays,
        reason || "",
        attachmentUrl || null
      );
    } catch {}

    // Update leave_balances pendingDays
    const requestYear = new Date(startDate).getFullYear();
    if (resolvedTypeId) {
      try {
        let bal = await db.prepare(`
          SELECT * FROM leave_balances 
          WHERE "employeeId" = ? AND "leaveTypeId" = ? AND year = ?
        `).get(targetEmpId, resolvedTypeId, requestYear) as any;

        if (!bal) {
          // Initialize balance from leave type
          const lt = await db.prepare("SELECT * FROM leave_types WHERE id = ?").get(resolvedTypeId) as any;
          const allowed = Number(lt?.daysAllowed || 15);
          const balId = `bal-${targetEmpId}-${lt?.code || 'LT'}-${requestYear}`;
          await db.prepare(`
            INSERT INTO leave_balances (
              id, "employeeId", "leaveTypeId", year, "allocatedDays", "usedDays", "pendingDays", "remainingDays"
            ) VALUES (?, ?, ?, ?, ?, 0.00, 0.00, ?)
            ON CONFLICT (id) DO NOTHING
          `).run(balId, targetEmpId, resolvedTypeId, requestYear, allowed, allowed);

          bal = await db.prepare("SELECT * FROM leave_balances WHERE id = ?").get(balId) as any;
        }

        if (bal) {
          const newPending = Number(bal.pendingDays || 0) + finalDays;
          const newRemaining = Number(bal.allocatedDays || 0) - Number(bal.usedDays || 0) - newPending;
          await db.prepare(`
            UPDATE leave_balances SET
              "pendingDays" = ?,
              "remainingDays" = ?,
              "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(newPending, newRemaining, bal.id);
        }
      } catch (e: any) {
        console.warn("[Leaves] Balance update notice:", e.message);
      }
    }

    await logAudit(req, "SUBMIT_LEAVE_REQUEST", JSON.stringify({
      id: reqId,
      employeeId: targetEmpId,
      leaveType: resolvedTypeName,
      startDate,
      endDate,
      days: finalDays
    }));

    broadcastRealtime("leave_requests_changed", { type: "submitted", id: reqId, employeeId: targetEmpId });
    broadcastRealtime("leaves_changed", { type: "submitted", id: reqId });

    const created = await db.prepare("SELECT * FROM leave_requests WHERE id = ?").get(reqId);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leave-requests/:id/approve - Approve a leave request
leavesRouter.post(["/leave-requests/:id/approve", "/leaves/:id/approve", "/leave-applications/:id/approve"], async (req: any, res: any) => {
  try {
    const auth = await getUserAuth(req);
    const { id } = req.params;
    const { approverRemarks } = req.body;

    if (auth.role === "employee") {
      return res.status(403).json({ error: "Unauthorized: Employees cannot approve leave requests" });
    }

    const request = await db.prepare("SELECT * FROM leave_requests WHERE id = ?").get(id) as any;
    if (!request) {
      return res.status(404).json({ error: "Leave request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ error: `Cannot approve request with status '${request.status}'` });
    }

    // Department Head scope check
    if (auth.role === "department_head") {
      const dh = await getDepartmentHeadAuthorizedEmployeeIds(auth.userId, auth.userEmail, auth.employee?.id);
      if (!dh.authorizedEmployeeIds.has(request.employeeId)) {
        return res.status(403).json({
          error: "Unauthorized: You can only approve leave requests for employees under your authorized department"
        });
      }
    }

    const approverName = auth.employee
      ? `${auth.employee.firstName} ${auth.employee.lastName}`
      : (auth.userEmail || "Department Head / Admin");

    // Update leave_requests table
    await db.prepare(`
      UPDATE leave_requests SET
        status = 'approved',
        "approvedBy" = ?,
        "approvedAt" = CURRENT_TIMESTAMP,
        "reviewedBy" = ?,
        "reviewedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(auth.userId, approverName, id);

    // Update leave_applications table
    try {
      await db.prepare(`
        UPDATE leave_applications SET
          status = 'approved',
          "approvedBy" = ?,
          "approvedAt" = CURRENT_TIMESTAMP,
          "reviewedBy" = ?,
          "reviewedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(auth.userId, approverName, id);
    } catch {}

    // Update leave_balances (pendingDays -> usedDays)
    const days = Number(request.daysCount || 1.0);
    const year = new Date(request.startDate).getFullYear();
    if (request.leaveTypeId) {
      try {
        const bal = await db.prepare(`
          SELECT * FROM leave_balances 
          WHERE "employeeId" = ? AND "leaveTypeId" = ? AND year = ?
        `).get(request.employeeId, request.leaveTypeId, year) as any;

        if (bal) {
          const newPending = Math.max(0, Number(bal.pendingDays || 0) - days);
          const newUsed = Number(bal.usedDays || 0) + days;
          const newRemaining = Number(bal.allocatedDays || 0) - newUsed - newPending;

          await db.prepare(`
            UPDATE leave_balances SET
              "pendingDays" = ?,
              "usedDays" = ?,
              "remainingDays" = ?,
              "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(newPending, newUsed, newRemaining, bal.id);
        }
      } catch (e: any) {
        console.warn("[Leaves] Balance deduction notice:", e.message);
      }
    }

    await logAudit(req, "APPROVE_LEAVE_REQUEST", JSON.stringify({
      id,
      employeeId: request.employeeId,
      leaveType: request.leaveType,
      days
    }));

    // Trigger payroll recalculation and realtime sync
    triggerBackgroundPayrollSync();
    broadcastRealtime("leave_requests_changed", { type: "approved", id, employeeId: request.employeeId });
    broadcastRealtime("dtr_changed", { source: "leave_approved" });

    const updated = await db.prepare("SELECT * FROM leave_requests WHERE id = ?").get(id);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leave-requests/:id/reject - Reject a leave request
leavesRouter.post(["/leave-requests/:id/reject", "/leaves/:id/reject", "/leave-applications/:id/reject"], async (req: any, res: any) => {
  try {
    const auth = await getUserAuth(req);
    const { id } = req.params;
    const { rejectionReason, reason } = req.body;

    const finalReason = String(rejectionReason || reason || "").trim();
    if (!finalReason) {
      return res.status(400).json({ error: "Rejection reason is mandatory when rejecting a leave request" });
    }

    if (auth.role === "employee") {
      return res.status(403).json({ error: "Unauthorized: Employees cannot reject leave requests" });
    }

    const request = await db.prepare("SELECT * FROM leave_requests WHERE id = ?").get(id) as any;
    if (!request) {
      return res.status(404).json({ error: "Leave request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ error: `Cannot reject request with status '${request.status}'` });
    }

    // Department Head scope check
    if (auth.role === "department_head") {
      const dh = await getDepartmentHeadAuthorizedEmployeeIds(auth.userId, auth.userEmail, auth.employee?.id);
      if (!dh.authorizedEmployeeIds.has(request.employeeId)) {
        return res.status(403).json({
          error: "Unauthorized: You can only reject leave requests for employees under your authorized department"
        });
      }
    }

    const reviewerName = auth.employee
      ? `${auth.employee.firstName} ${auth.employee.lastName}`
      : (auth.userEmail || "Department Head / Admin");

    // Update leave_requests
    await db.prepare(`
      UPDATE leave_requests SET
        status = 'rejected',
        "rejectionReason" = ?,
        "rejectedBy" = ?,
        "rejectedAt" = CURRENT_TIMESTAMP,
        "reviewedBy" = ?,
        "reviewedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(finalReason, auth.userId, reviewerName, id);

    // Update leave_applications
    try {
      await db.prepare(`
        UPDATE leave_applications SET
          status = 'rejected',
          "rejectionReason" = ?,
          "rejectedBy" = ?,
          "rejectedAt" = CURRENT_TIMESTAMP,
          "reviewedBy" = ?,
          "reviewedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(finalReason, auth.userId, reviewerName, id);
    } catch {}

    // Restore pendingDays in leave_balances
    const days = Number(request.daysCount || 1.0);
    const year = new Date(request.startDate).getFullYear();
    if (request.leaveTypeId) {
      try {
        const bal = await db.prepare(`
          SELECT * FROM leave_balances 
          WHERE "employeeId" = ? AND "leaveTypeId" = ? AND year = ?
        `).get(request.employeeId, request.leaveTypeId, year) as any;

        if (bal) {
          const newPending = Math.max(0, Number(bal.pendingDays || 0) - days);
          const newRemaining = Number(bal.allocatedDays || 0) - Number(bal.usedDays || 0) - newPending;

          await db.prepare(`
            UPDATE leave_balances SET
              "pendingDays" = ?,
              "remainingDays" = ?,
              "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(newPending, newRemaining, bal.id);
        }
      } catch (e: any) {
        console.warn("[Leaves] Balance restoration notice:", e.message);
      }
    }

    await logAudit(req, "REJECT_LEAVE_REQUEST", JSON.stringify({
      id,
      employeeId: request.employeeId,
      rejectionReason: finalReason
    }));

    broadcastRealtime("leave_requests_changed", { type: "rejected", id, employeeId: request.employeeId });
    const updated = await db.prepare("SELECT * FROM leave_requests WHERE id = ?").get(id);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leave-requests/:id/cancel - Cancel a pending (or approved) leave request
leavesRouter.post(["/leave-requests/:id/cancel", "/leaves/:id/cancel", "/leave-applications/:id/cancel"], async (req: any, res: any) => {
  try {
    const auth = await getUserAuth(req);
    const { id } = req.params;
    const { cancellationReason } = req.body;

    const request = await db.prepare("SELECT * FROM leave_requests WHERE id = ?").get(id) as any;
    if (!request) {
      return res.status(404).json({ error: "Leave request not found" });
    }

    const wasApproved = request.status === "approved";
    const wasPending = request.status === "pending";

    // Employee authorization check
    if (auth.role === "employee") {
      const empId = auth.employee ? auth.employee.id : auth.userId;
      if (request.employeeId !== empId && request.employeeId !== auth.userId) {
        return res.status(403).json({ error: "Unauthorized: You can only cancel your own leave requests" });
      }
      if (!wasPending) {
        return res.status(400).json({ error: "Employees can only cancel requests that are currently in Pending status" });
      }
    } else if (auth.role === "department_head") {
      const dh = await getDepartmentHeadAuthorizedEmployeeIds(auth.userId, auth.userEmail, auth.employee?.id);
      if (!dh.authorizedEmployeeIds.has(request.employeeId)) {
        return res.status(403).json({ error: "Unauthorized: Cannot cancel requests outside your authorized department" });
      }
    }

    if (request.status === "cancelled" || request.status === "rejected") {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }

    // Update leave_requests
    await db.prepare(`
      UPDATE leave_requests SET
        status = 'cancelled',
        "cancelledBy" = ?,
        "cancelledAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(auth.userId, id);

    // Update leave_applications
    try {
      await db.prepare(`
        UPDATE leave_applications SET
          status = 'cancelled',
          "cancelledBy" = ?,
          "cancelledAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(auth.userId, id);
    } catch {}

    // Restore days in leave_balances
    const days = Number(request.daysCount || 1.0);
    const year = new Date(request.startDate).getFullYear();
    if (request.leaveTypeId) {
      try {
        const bal = await db.prepare(`
          SELECT * FROM leave_balances 
          WHERE "employeeId" = ? AND "leaveTypeId" = ? AND year = ?
        `).get(request.employeeId, request.leaveTypeId, year) as any;

        if (bal) {
          let newPending = Number(bal.pendingDays || 0);
          let newUsed = Number(bal.usedDays || 0);

          if (wasPending) {
            newPending = Math.max(0, newPending - days);
          } else if (wasApproved) {
            newUsed = Math.max(0, newUsed - days);
          }

          const newRemaining = Number(bal.allocatedDays || 0) - newUsed - newPending;

          await db.prepare(`
            UPDATE leave_balances SET
              "pendingDays" = ?,
              "usedDays" = ?,
              "remainingDays" = ?,
              "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(newPending, newUsed, newRemaining, bal.id);
        }
      } catch (e: any) {
        console.warn("[Leaves] Balance cancellation notice:", e.message);
      }
    }

    await logAudit(req, "CANCEL_LEAVE_REQUEST", JSON.stringify({
      id,
      employeeId: request.employeeId,
      wasApproved,
      cancellationReason
    }));

    if (wasApproved) {
      triggerBackgroundPayrollSync();
      broadcastRealtime("dtr_changed", { source: "leave_cancelled" });
    }

    broadcastRealtime("leave_requests_changed", { type: "cancelled", id, employeeId: request.employeeId });

    const updated = await db.prepare("SELECT * FROM leave_requests WHERE id = ?").get(id);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/leave-requests/:id - Delete a request record (Admin only)
leavesRouter.delete(["/leave-requests/:id", "/leaves/:id", "/leave-applications/:id"], async (req: any, res: any) => {
  try {
    const auth = await getUserAuth(req);
    if (auth.role !== "admin" && auth.role !== "super_admin") {
      return res.status(403).json({ error: "Unauthorized: Only administrators can delete leave request records" });
    }

    const { id } = req.params;
    const request = await db.prepare("SELECT * FROM leave_requests WHERE id = ?").get(id) as any;
    if (!request) {
      return res.status(404).json({ error: "Leave request not found" });
    }

    await db.prepare("DELETE FROM leave_requests WHERE id = ?").run(id);
    try {
      await db.prepare("DELETE FROM leave_applications WHERE id = ?").run(id);
    } catch {}

    if (request.status === "approved") {
      triggerBackgroundPayrollSync();
      broadcastRealtime("dtr_changed", { source: "leave_deleted" });
    }

    await logAudit(req, "DELETE_LEAVE_REQUEST", JSON.stringify({ id }));
    broadcastRealtime("leave_requests_changed", { type: "deleted", id });

    res.json({ message: "Leave request deleted successfully", id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
