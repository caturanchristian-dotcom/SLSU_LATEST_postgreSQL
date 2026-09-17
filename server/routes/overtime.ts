import { Router } from "express";
import { db, logAudit } from "../db/schema.js";
import { calculateNetSalary } from "../services/payrollCalculator.js";
import { broadcastRealtime } from "../index.js";
import { resolveEmployeeId } from "./dtr.js";

export const overtimeRouter = Router();

// Debounced background payroll calculation after overtime approval/rejection/cancellation
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
      broadcastRealtime("payroll_changed", { source: "overtime" });
      broadcastRealtime("overtime_changed", { source: "overtime" });
      broadcastRealtime("dtr_changed", { source: "overtime" });
    } catch (err) {
      console.error("Error background syncing payroll cycles on overtime change:", err);
    }
  }, 150);
}

// Calculate duration in hours between two time strings (e.g., "17:00" and "20:30")
function calculateHours(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  
  const parseTimeToMinutes = (t: string): number => {
    const clean = t.trim().toLowerCase();
    const isPM = clean.includes("pm");
    const isAM = clean.includes("am");
    const timeWithoutAmPm = clean.replace(/[apm\s]/g, "");
    const parts = timeWithoutAmPm.split(":").map(Number);
    let h = parts[0] || 0;
    const m = parts[1] || 0;
    
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    
    return h * 60 + m;
  };

  const startMin = parseTimeToMinutes(startTime);
  let endMin = parseTimeToMinutes(endTime);
  
  // If end time is past midnight (e.g., 23:00 to 02:00 next day)
  if (endMin < startMin) {
    endMin += 24 * 60;
  }
  
  const diffMinutes = endMin - startMin;
  const hours = Math.max(0, diffMinutes / 60);
  return Number(hours.toFixed(2));
}

// Helper to normalize date string to YYYY-MM-DD
function normalizeDateStr(d: any): string {
  if (!d) return "";
  if (typeof d === "string") return d.split("T")[0];
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d).split("T")[0];
}

// Performance database indexes initialization
try {
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_ot_employeeId ON overtime_requests("employeeId")`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_ot_status ON overtime_requests(status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_ot_overtimeDate ON overtime_requests("overtimeDate")`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_ot_status_date ON overtime_requests(status, "overtimeDate")`).run();
} catch (e) {
  // indexes already present
}

// ============================================================================
// 1. GET /api/overtime-requests - List Overtime Requests with rich filters
// ============================================================================
overtimeRouter.get(["/overtime-requests", "/overtime"], async (req: any, res: any) => {
  try {
    const { 
      status, 
      employeeId, 
      startDate, 
      endDate, 
      department, 
      campus, 
      search, 
      page, 
      limit 
    } = req.query;

    let targetEmpId = employeeId ? await resolveEmployeeId(employeeId) : null;

    let query = `
      SELECT ot.*, 
             e."firstName", e."lastName", e."employeeId" as "employeeNo", 
             e.email, e.category, e.position, e.campus, e."profileImage",
             e."basicSalary", e."salaryType"
      FROM overtime_requests ot
      LEFT JOIN employees e ON ot."employeeId" = e.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (targetEmpId) {
      query += ` AND (ot."employeeId" = ? OR e."employeeId" = ? OR LOWER(e.email) = LOWER(?))`;
      params.push(targetEmpId, employeeId, employeeId);
    }

    if (status && status !== "all") {
      query += ` AND ot.status = ?`;
      params.push(status.toLowerCase());
    }

    if (startDate) {
      query += ` AND ot."overtimeDate" >= ?`;
      params.push(normalizeDateStr(startDate));
    }

    if (endDate) {
      query += ` AND ot."overtimeDate" <= ?`;
      params.push(normalizeDateStr(endDate));
    }

    if (department && department !== "all") {
      query += ` AND (e.category = ? OR e.position = ?)`;
      params.push(department, department);
    }

    if (campus && campus !== "all") {
      query += ` AND e.campus = ?`;
      params.push(campus);
    }

    if (search) {
      const s = `%${search.trim().toLowerCase()}%`;
      query += ` AND (
        LOWER(e."firstName") LIKE ? OR 
        LOWER(e."lastName") LIKE ? OR 
        LOWER(e."employeeId") LIKE ? OR 
        LOWER(ot.reason) LIKE ? OR
        LOWER(ot.id) LIKE ?
      )`;
      params.push(s, s, s, s, s);
    }

    query += ` ORDER BY ot."overtimeDate" DESC, ot."createdAt" DESC`;

    const allRows = await db.prepare(query).all(...params) as any[];

    // Calculate Summary Statistics for requested set
    const stats = {
      total: allRows.length,
      pending: allRows.filter((r) => r.status === "pending").length,
      approved: allRows.filter((r) => r.status === "approved").length,
      rejected: allRows.filter((r) => r.status === "rejected").length,
      cancelled: allRows.filter((r) => r.status === "cancelled").length,
      totalRequestedHours: Number(allRows.reduce((acc, r) => acc + Number(r.requestedHours || 0), 0).toFixed(2)),
      totalApprovedHours: Number(allRows.filter((r) => r.status === "approved").reduce((acc, r) => acc + Number(r.approvedHours || r.requestedHours || 0), 0).toFixed(2)),
      totalPayableHours: Number(allRows.filter((r) => r.status === "approved").reduce((acc, r) => acc + Number(r.payableHours || r.approvedHours || r.requestedHours || 0), 0).toFixed(2)),
    };

    // Apply pagination if specified
    if (page && limit) {
      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.max(1, parseInt(limit, 10));
      const offset = (pageNum - 1) * limitNum;
      const paginated = allRows.slice(offset, offset + limitNum);
      return res.json({
        data: paginated,
        stats,
        pagination: {
          total: allRows.length,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(allRows.length / limitNum)
        }
      });
    }

    res.json({
      data: allRows,
      stats
    });
  } catch (err: any) {
    console.error("Error fetching overtime requests:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 2. GET /api/overtime-requests/summary - Summary statistics for dashboard widgets
// ============================================================================
overtimeRouter.get(["/overtime-requests/summary", "/overtime/summary"], async (req: any, res: any) => {
  try {
    const { employeeId } = req.query;
    let query = `SELECT status, "requestedHours", "approvedHours", "payableHours" FROM overtime_requests`;
    const params: any[] = [];

    if (employeeId) {
      const resolvedId = await resolveEmployeeId(employeeId);
      query += ` WHERE "employeeId" = ?`;
      params.push(resolvedId);
    }

    const rows = await db.prepare(query).all(...params) as any[];

    const summary = {
      total: rows.length,
      pending: rows.filter((r) => r.status === "pending").length,
      approved: rows.filter((r) => r.status === "approved").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
      totalApprovedHours: Number(rows.filter((r) => r.status === "approved").reduce((sum, r) => sum + Number(r.approvedHours || r.requestedHours || 0), 0).toFixed(2)),
      totalPayableHours: Number(rows.filter((r) => r.status === "approved").reduce((sum, r) => sum + Number(r.payableHours || r.approvedHours || 0), 0).toFixed(2))
    };

    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 3. GET /api/overtime-requests/:id - Single Overtime Request details
// ============================================================================
overtimeRouter.get(["/overtime-requests/:id", "/overtime/:id"], async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const item = await db.prepare(`
      SELECT ot.*, 
             e."firstName", e."lastName", e."employeeId" as "employeeNo", 
             e.email, e.category, e.position, e.campus, e."profileImage",
             e."basicSalary", e."salaryType"
      FROM overtime_requests ot
      LEFT JOIN employees e ON ot."employeeId" = e.id
      WHERE ot.id = ?
    `).get(id) as any;

    if (!item) {
      return res.status(404).json({ error: "Overtime request not found" });
    }

    // Also fetch attendance record for that employee on that overtimeDate
    const dtrDate = normalizeDateStr(item.overtimeDate);
    const dtr = await db.prepare(`
      SELECT * FROM dtr_records 
      WHERE "employeeId" = ? AND date = ?
      LIMIT 1
    `).get(item.employeeId, dtrDate) as any;

    res.json({
      ...item,
      dtrRecord: dtr || null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 4. POST /api/overtime-requests - Submit New Overtime Request
// ============================================================================
overtimeRouter.post(["/overtime-requests", "/overtime"], async (req: any, res: any) => {
  try {
    const { 
      employeeId, 
      overtimeDate, 
      startTime, 
      endTime, 
      reason, 
      documentUrl, 
      requestedHours: customHours 
    } = req.body;

    if (!employeeId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    if (!overtimeDate) {
      return res.status(400).json({ error: "Overtime date is required" });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({ error: "Start time and End time are required" });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Reason for overtime is required" });
    }

    const resolvedEmpId = await resolveEmployeeId(employeeId);
    const emp = await db.prepare(`SELECT * FROM employees WHERE id = ? LIMIT 1`).get(resolvedEmpId) as any;
    if (!emp) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const cleanDate = normalizeDateStr(overtimeDate);
    const calculatedH = calculateHours(startTime, endTime);
    const finalRequestedHours = Number(customHours || calculatedH);

    if (finalRequestedHours <= 0) {
      return res.status(400).json({ error: "Overtime end time must be after start time (minimum 0.5 hours)" });
    }

    if (finalRequestedHours > 16) {
      return res.status(400).json({ error: "Overtime request cannot exceed 16 hours in a single day" });
    }

    // Check for duplicate pending or approved requests on the same date for this employee
    const existing = await db.prepare(`
      SELECT id, status, "startTime", "endTime" FROM overtime_requests 
      WHERE "employeeId" = ? AND "overtimeDate" = ? AND status IN ('pending', 'approved')
    `).all(resolvedEmpId, cleanDate) as any[];

    if (existing && existing.length > 0) {
      return res.status(400).json({ 
        error: `An overtime request for ${cleanDate} already exists (${existing[0].status.toUpperCase()}). Please cancel or review the existing request.` 
      });
    }

    const id = `ot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    await db.prepare(`
      INSERT INTO overtime_requests (
        id, "employeeId", "overtimeDate", "startTime", "endTime", 
        "requestedHours", "approvedHours", "actualHours", "payableHours", 
        reason, status, "documentUrl", "createdAt", "updatedAt"
      )
      VALUES (?, ?, ?, ?, ?, ?, 0.00, 0.00, 0.00, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      id, 
      resolvedEmpId, 
      cleanDate, 
      startTime.trim(), 
      endTime.trim(), 
      finalRequestedHours, 
      reason.trim(), 
      documentUrl || null
    );

    await logAudit(
      req,
      "SUBMIT_OVERTIME_REQUEST",
      `Submitted overtime request for ${cleanDate} (${startTime} - ${endTime}, ${finalRequestedHours} hrs). Reason: ${reason.trim()}`
    );

    broadcastRealtime("overtime_changed", { action: "create", id, employeeId: resolvedEmpId });

    res.status(201).json({
      success: true,
      message: "Your overtime request has been submitted and is pending approval.",
      id,
      requestedHours: finalRequestedHours
    });
  } catch (err: any) {
    console.error("Error submitting overtime request:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 5. PUT /api/overtime-requests/:id - Edit pending request
// ============================================================================
overtimeRouter.put(["/overtime-requests/:id", "/overtime/:id"], async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { overtimeDate, startTime, endTime, reason, documentUrl } = req.body;

    const existing = await db.prepare("SELECT * FROM overtime_requests WHERE id = ?").get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: "Overtime request not found" });
    }

    if (existing.status !== "pending") {
      return res.status(400).json({ error: `Cannot edit request with status '${existing.status}'. Only pending requests can be modified.` });
    }

    const sTime = startTime || existing.startTime;
    const eTime = endTime || existing.endTime;
    const cleanDate = overtimeDate ? normalizeDateStr(overtimeDate) : normalizeDateStr(existing.overtimeDate);
    const finalHours = calculateHours(sTime, eTime);

    if (finalHours <= 0) {
      return res.status(400).json({ error: "Overtime end time must be after start time" });
    }

    await db.prepare(`
      UPDATE overtime_requests 
      SET "overtimeDate" = ?, "startTime" = ?, "endTime" = ?, "requestedHours" = ?, reason = ?, "documentUrl" = ?, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      cleanDate, 
      sTime.trim(), 
      eTime.trim(), 
      finalHours, 
      (reason !== undefined ? reason : existing.reason).trim(), 
      documentUrl !== undefined ? documentUrl : existing.documentUrl, 
      id
    );

    await logAudit(
      req,
      "UPDATE_OVERTIME_REQUEST",
      `Updated overtime request ${id} for ${cleanDate} (${finalHours} hrs)`
    );

    broadcastRealtime("overtime_changed", { action: "update", id });

    res.json({ success: true, message: "Overtime request updated successfully", requestedHours: finalHours });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 6. POST /api/overtime-requests/:id/approve - Approve Overtime Request (Admin / Supervisor)
// ============================================================================
overtimeRouter.post(["/overtime-requests/:id/approve", "/overtime/:id/approve"], async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { 
      approverId, 
      approverName, 
      approvalRemarks, 
      approvedHours: customApprovedHours 
    } = req.body;

    const existing = await db.prepare(`
      SELECT ot.*, e."firstName", e."lastName", e.email 
      FROM overtime_requests ot
      LEFT JOIN employees e ON ot."employeeId" = e.id
      WHERE ot.id = ?
    `).get(id) as any;

    if (!existing) {
      return res.status(404).json({ error: "Overtime request not found" });
    }

    if (existing.status === "approved") {
      return res.status(400).json({ error: "Overtime request is already approved" });
    }

    const requestedH = Number(existing.requestedHours || 0);
    const approvedH = customApprovedHours !== undefined && Number(customApprovedHours) > 0 
      ? Number(customApprovedHours) 
      : requestedH;

    // Validate against actual DTR attendance record for that date
    const dtrDate = normalizeDateStr(existing.overtimeDate);
    const dtr = await db.prepare(`
      SELECT * FROM dtr_records 
      WHERE "employeeId" = ? AND date = ? 
      LIMIT 1
    `).get(existing.employeeId, dtrDate) as any;

    let actualH = 0;
    if (dtr) {
      // If DTR record has overtimeHours or total hours worked beyond 8 hours
      const dtrOt = Number(dtr.overtimeHours || 0);
      const dtrHoursWorked = Number(dtr.hoursWorked || 0);
      actualH = dtrOt > 0 ? dtrOt : (dtrHoursWorked > 8 ? Number((dtrHoursWorked - 8).toFixed(2)) : approvedH);
    } else {
      actualH = approvedH;
    }

    // Payable hours is capped by approved hours and verified actual hours
    const payableH = Math.min(approvedH, actualH > 0 ? actualH : approvedH);

    const activeApproverId = approverId || req.headers?.["x-user-id"] || "admin";
    const activeApproverName = approverName || req.headers?.["x-user-name"] || "Administrator / Supervisor";
    const remarks = approvalRemarks || "Approved for official duty and payroll credit.";

    await db.prepare(`
      UPDATE overtime_requests
      SET status = 'approved',
          "approvedHours" = ?,
          "actualHours" = ?,
          "payableHours" = ?,
          "approverId" = ?,
          "approverName" = ?,
          "approvalRemarks" = ?,
          "approvedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      approvedH,
      actualH,
      payableH,
      activeApproverId,
      activeApproverName,
      remarks,
      id
    );

    await logAudit(
      req,
      "APPROVE_OVERTIME_REQUEST",
      `Approved overtime request ${id} for employee ${existing.firstName} ${existing.lastName} (${dtrDate}, ${approvedH} hrs approved, ${payableH} hrs payable). Remarks: ${remarks}`
    );

    // Trigger instant background recalculation of payroll & real-time broadcasts
    triggerBackgroundPayrollSync();

    res.json({
      success: true,
      message: `Overtime request for ${dtrDate} has been approved.`,
      approvedHours: approvedH,
      payableHours: payableH
    });
  } catch (err: any) {
    console.error("Error approving overtime request:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 7. POST /api/overtime-requests/:id/reject - Reject Overtime Request
// ============================================================================
overtimeRouter.post(["/overtime-requests/:id/reject", "/overtime/:id/reject"], async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { 
      approverId, 
      approverName, 
      approvalRemarks, 
      rejectionReason 
    } = req.body;

    const existing = await db.prepare(`
      SELECT ot.*, e."firstName", e."lastName", e.email 
      FROM overtime_requests ot
      LEFT JOIN employees e ON ot."employeeId" = e.id
      WHERE ot.id = ?
    `).get(id) as any;

    if (!existing) {
      return res.status(404).json({ error: "Overtime request not found" });
    }

    const remarks = rejectionReason || approvalRemarks || "Declined based on departmental scheduling / budget allocation.";
    const activeApproverId = approverId || req.headers?.["x-user-id"] || "admin";
    const activeApproverName = approverName || req.headers?.["x-user-name"] || "Administrator / Supervisor";

    await db.prepare(`
      UPDATE overtime_requests
      SET status = 'rejected',
          "approvedHours" = 0.00,
          "payableHours" = 0.00,
          "approverId" = ?,
          "approverName" = ?,
          "approvalRemarks" = ?,
          "rejectedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      activeApproverId,
      activeApproverName,
      remarks,
      id
    );

    await logAudit(
      req,
      "REJECT_OVERTIME_REQUEST",
      `Rejected overtime request ${id} for employee ${existing.firstName} ${existing.lastName}. Reason: ${remarks}`
    );

    triggerBackgroundPayrollSync();

    res.json({
      success: true,
      message: "Overtime request has been rejected.",
      approvalRemarks: remarks
    });
  } catch (err: any) {
    console.error("Error rejecting overtime request:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 7B. POST /api/overtime-requests/batch-approve - Fast Batch Approval
// ============================================================================
overtimeRouter.post(["/overtime-requests/batch-approve", "/overtime/batch-approve"], async (req: any, res: any) => {
  try {
    const { ids, approverId, approverName, approvalRemarks } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Please provide a list of overtime request IDs to approve." });
    }

    const activeApproverId = approverId || req.headers?.["x-user-id"] || "admin";
    const activeApproverName = approverName || req.headers?.["x-user-name"] || "Administrator / Supervisor";
    const remarks = approvalRemarks || "Batch approved for official duty.";

    let approvedCount = 0;
    for (const id of ids) {
      const existing = await db.prepare(`SELECT * FROM overtime_requests WHERE id = ?`).get(id) as any;
      if (existing && existing.status === "pending") {
        const h = Number(existing.requestedHours || 0);
        await db.prepare(`
          UPDATE overtime_requests
          SET status = 'approved',
              "approvedHours" = ?,
              "actualHours" = ?,
              "payableHours" = ?,
              "approverId" = ?,
              "approverName" = ?,
              "approvalRemarks" = ?,
              "approvedAt" = CURRENT_TIMESTAMP,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(h, h, h, activeApproverId, activeApproverName, remarks, id);
        approvedCount++;
      }
    }

    await logAudit(
      req,
      "BATCH_APPROVE_OVERTIME",
      `Batch approved ${approvedCount} overtime requests.`
    );

    triggerBackgroundPayrollSync();

    res.json({
      success: true,
      message: `Successfully approved ${approvedCount} overtime requests.`,
      approvedCount
    });
  } catch (err: any) {
    console.error("Error in batch approve:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 7C. POST /api/overtime-requests/batch-reject - Fast Batch Rejection
// ============================================================================
overtimeRouter.post(["/overtime-requests/batch-reject", "/overtime/batch-reject"], async (req: any, res: any) => {
  try {
    const { ids, approverId, approverName, rejectionReason } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Please provide a list of overtime request IDs to reject." });
    }

    const activeApproverId = approverId || req.headers?.["x-user-id"] || "admin";
    const activeApproverName = approverName || req.headers?.["x-user-name"] || "Administrator / Supervisor";
    const remarks = rejectionReason || "Declined during departmental review.";

    let rejectedCount = 0;
    for (const id of ids) {
      const existing = await db.prepare(`SELECT * FROM overtime_requests WHERE id = ?`).get(id) as any;
      if (existing && existing.status === "pending") {
        await db.prepare(`
          UPDATE overtime_requests
          SET status = 'rejected',
              "approvedHours" = 0.00,
              "payableHours" = 0.00,
              "approverId" = ?,
              "approverName" = ?,
              "approvalRemarks" = ?,
              "rejectedAt" = CURRENT_TIMESTAMP,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(activeApproverId, activeApproverName, remarks, id);
        rejectedCount++;
      }
    }

    await logAudit(
      req,
      "BATCH_REJECT_OVERTIME",
      `Batch rejected ${rejectedCount} overtime requests.`
    );

    triggerBackgroundPayrollSync();

    res.json({
      success: true,
      message: `Successfully rejected ${rejectedCount} overtime requests.`,
      rejectedCount
    });
  } catch (err: any) {
    console.error("Error in batch reject:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 8. POST /api/overtime-requests/:id/cancel - Cancel Overtime Request (Employee)
// ============================================================================
overtimeRouter.post(["/overtime-requests/:id/cancel", "/overtime/:id/cancel"], async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { reason: cancelReason } = req.body;

    const existing = await db.prepare("SELECT * FROM overtime_requests WHERE id = ?").get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: "Overtime request not found" });
    }

    if (existing.status !== "pending") {
      return res.status(400).json({ 
        error: `Cannot cancel a request that has already been ${existing.status}. Only pending requests can be cancelled.` 
      });
    }

    await db.prepare(`
      UPDATE overtime_requests
      SET status = 'cancelled',
          "cancelledAt" = CURRENT_TIMESTAMP,
          "approvalRemarks" = ?,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(cancelReason || "Cancelled by employee.", id);

    await logAudit(
      req,
      "CANCEL_OVERTIME_REQUEST",
      `Employee cancelled overtime request ${id} for ${normalizeDateStr(existing.overtimeDate)}`
    );

    triggerBackgroundPayrollSync();

    res.json({
      success: true,
      message: "Overtime request has been cancelled."
    });
  } catch (err: any) {
    console.error("Error cancelling overtime request:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 9. DELETE /api/overtime-requests/:id - Delete Request (Admin / Cleanup)
// ============================================================================
overtimeRouter.delete(["/overtime-requests/:id", "/overtime/:id"], async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const existing = await db.prepare("SELECT * FROM overtime_requests WHERE id = ?").get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: "Overtime request not found" });
    }

    await db.prepare("DELETE FROM overtime_requests WHERE id = ?").run(id);

    await logAudit(
      req,
      "DELETE_OVERTIME_REQUEST",
      `Deleted overtime record ${id}`
    );

    triggerBackgroundPayrollSync();

    res.json({ success: true, message: "Overtime request record deleted." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
