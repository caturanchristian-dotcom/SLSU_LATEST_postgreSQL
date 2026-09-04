import { Router } from "express";
import { db, logAudit } from "../db/schema.js";
import { calculateNetSalary } from "../services/payrollCalculator.js";
import { broadcastRealtime } from "../index.js";

export const dtrRouter = Router();

async function syncActivePayrollCycles() {
  try {
    const activeCycles = await db.prepare(
      "SELECT id FROM payroll_cycles WHERE status NOT IN ('disbursed', 'completed', 'archived') OR status IS NULL"
    ).all() as any[];
    for (const cycle of activeCycles) {
      await calculateNetSalary(cycle.id);
    }
    broadcastRealtime("payroll_changed", { source: "dtr" });
    broadcastRealtime("dtr_changed", { source: "dtr" });
  } catch (err) {
    console.error("Error auto-syncing payroll cycles on DTR change:", err);
  }
}

// Helper to resolve employee ID from employee id, user id, or email
async function resolveEmployeeId(idOrEmail: string): Promise<string> {
  if (!idOrEmail) return idOrEmail;
  try {
    // 1. Exact match in employees.id
    const empById = await db.prepare("SELECT id FROM employees WHERE id = ?").get(idOrEmail) as any;
    if (empById) return empById.id;

    // 2. Check if it's a user in users table
    const user = await db.prepare("SELECT email FROM users WHERE id = ?").get(idOrEmail) as any;
    if (user && user.email) {
      const empByEmail = await db.prepare("SELECT id FROM employees WHERE LOWER(email) = LOWER(?)").get(user.email) as any;
      if (empByEmail) return empByEmail.id;
    }

    // 3. Direct email match
    const empByDirectEmail = await db.prepare("SELECT id FROM employees WHERE LOWER(email) = LOWER(?)").get(idOrEmail) as any;
    if (empByDirectEmail) return empByDirectEmail.id;
  } catch (e) {}

  return idOrEmail;
}

// DTR Daily Records
dtrRouter.get("/dtr", async (req: any, res: any) => {
  try {
    const { startDate, endDate, employeeId, campus } = req.query;
    const resolvedEmpId = employeeId ? await resolveEmployeeId(employeeId) : null;

    let query = `
      SELECT d.*, e.firstName, e.lastName, e.employeeId as employeeNo, e.category, e.campus
      FROM dtr_records d
      LEFT JOIN employees e ON d.employeeId = e.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (startDate && endDate) {
      query += " AND d.date >= ? AND d.date <= ?";
      params.push(startDate, endDate);
    }
    if (resolvedEmpId) {
      query += " AND (d.employeeId = ? OR d.employeeId = ?)";
      params.push(resolvedEmpId, employeeId);
    }
    if (campus && campus !== 'All Campuses') {
      query += " AND e.campus = ?";
      params.push(campus);
    }

    query += " ORDER BY d.date DESC, e.lastName ASC";
    const records = await db.prepare(query).all(...params);
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DTR Summary
dtrRouter.get("/dtr/summary", async (req: any, res: any) => {
  try {
    const { employeeId, month, year } = req.query;
    const resolvedEmpId = employeeId ? await resolveEmployeeId(employeeId) : null;
    const targetYear = year || new Date().getFullYear();
    const targetMonth = month ? String(month).padStart(2, '0') : String(new Date().getMonth() + 1).padStart(2, '0');
    const ymPrefix = `${targetYear}-${targetMonth}`;

    let records: any[] = [];
    if (resolvedEmpId) {
      records = await db.prepare(`
        SELECT * FROM dtr_records
        WHERE (employeeId = ? OR employeeId = ?) AND date LIKE ?
      `).all(resolvedEmpId, employeeId, `${ymPrefix}%`) as any[];
    } else {
      records = await db.prepare(`
        SELECT * FROM dtr_records
        WHERE date LIKE ?
      `).all(`${ymPrefix}%`) as any[];
    }

    const totalHours = records.reduce((sum, r) => sum + (Number(r.hoursWorked) || 0), 0);
    const totalDaysPresent = records.filter(r => (Number(r.hoursWorked) || 0) > 0).length;
    const totalLateMinutes = records.reduce((sum, r) => sum + (Number(r.lateMinutes) || 0), 0);
    const totalUndertimeMinutes = records.reduce((sum, r) => sum + (Number(r.undertimeMinutes) || 0), 0);

    res.json({
      employeeId: resolvedEmpId || employeeId,
      month: Number(targetMonth),
      year: Number(targetYear),
      totalHours,
      totalDaysPresent,
      totalLateMinutes,
      totalUndertimeMinutes,
      records
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Approve DTR
dtrRouter.post("/dtr/:id/approve", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("UPDATE dtr_records SET status = 'approved' WHERE id = ?").run(id);
    const updated = await db.prepare("SELECT * FROM dtr_records WHERE id = ?").get(id);
    await syncActivePayrollCycles();
    res.json(updated || { success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reject DTR
dtrRouter.post("/dtr/:id/reject", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    await db.prepare("UPDATE dtr_records SET status = 'rejected', notes = ? WHERE id = ?").run(reason || 'Rejected', id);
    const updated = await db.prepare("SELECT * FROM dtr_records WHERE id = ?").get(id);
    await syncActivePayrollCycles();
    res.json(updated || { success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Biometric & Punch Logs
dtrRouter.get("/dtr/logs", async (req: any, res: any) => {
  try {
    const { employeeId, limit } = req.query;
    const resolvedEmpId = employeeId ? await resolveEmployeeId(employeeId) : null;

    let query = `
      SELECT l.*, e.firstName, e.lastName, e.employeeId as employeeNo, e.campus
      FROM dtr_logs l
      LEFT JOIN employees e ON l.employeeId = e.id
    `;
    const params: any[] = [];

    if (resolvedEmpId) {
      query += " WHERE (l.employeeId = ? OR l.employeeId = ?)";
      params.push(resolvedEmpId, employeeId);
    }

    query += " ORDER BY l.timestamp DESC LIMIT ?";
    params.push(Number(limit) || 100);

    const logs = await db.prepare(query).all(...params);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

dtrRouter.post("/dtr/punch", async (req: any, res: any) => {
  try {
    const { employeeId, type, source, notes } = req.body;
    const id = `punch-${Date.now()}`;
    const timestamp = new Date().toISOString();

    await db.prepare(`
      INSERT INTO dtr_logs (id, employeeId, timestamp, type, source, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, employeeId, timestamp, type, source || "manual", notes || "");

    await logAudit(req, "DTR_PUNCH", `Punch log recorded for employee ${employeeId} (${type})`);
    await syncActivePayrollCycles();
    res.json({ success: true, id, timestamp });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Visiting Instructor Specific Attendance Records
dtrRouter.get("/dtr/visiting/records", async (req: any, res: any) => {
  try {
    const { employeeId, startDate, endDate } = req.query;
    const resolvedEmpId = employeeId ? await resolveEmployeeId(employeeId) : null;
    let query = `
      SELECT vr.*, e.firstName, e.lastName, e.employeeId as employeeNo, e.campus
      FROM dtr_visiting_records vr
      LEFT JOIN employees e ON vr.employeeId = e.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (resolvedEmpId) {
      query += " AND (vr.employeeId = ? OR vr.employeeId = ?)";
      params.push(resolvedEmpId, employeeId);
    }
    if (startDate && endDate) {
      query += " AND vr.date >= ? AND vr.date <= ?";
      params.push(startDate, endDate);
    }

    query += " ORDER BY vr.date DESC";
    const records = await db.prepare(query).all(...params);
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

dtrRouter.post("/dtr/visiting/records", async (req: any, res: any) => {
  try {
    const { employeeId, date, teachingLoadId, subjectCode, timeIn, timeOut, hoursRendered, hourlyRate, notes } = req.body;
    const resolvedEmpId = await resolveEmployeeId(employeeId);
    const id = `vr-${Date.now()}`;
    const rate = Number(hourlyRate || 350.00);
    const hrs = Number(hoursRendered || 0.00);
    const totalPay = Number((hrs * rate).toFixed(2));

    await db.prepare(`
      INSERT INTO dtr_visiting_records (id, employeeId, date, teachingLoadId, subjectCode, timeIn, timeOut, hoursRendered, hourlyRate, totalPay, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?)
    `).run(id, resolvedEmpId, date, teachingLoadId || null, subjectCode || "", timeIn || "", timeOut || "", hrs, rate, totalPay, notes || "");

    await syncActivePayrollCycles();
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

dtrRouter.delete("/dtr/visiting/records/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM dtr_visiting_records WHERE id = ?").run(id);
    await syncActivePayrollCycles();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get current employee status (for live clock in / clock out widgets)
dtrRouter.get("/dtr/status/:employeeId", async (req: any, res: any) => {
  try {
    const { employeeId } = req.params;
    const resolvedEmpId = await resolveEmployeeId(employeeId);
    const today = new Date().toISOString().split("T")[0];
    
    // Check if there is an active punch log or open record today
    const record = await db.prepare(`
      SELECT * FROM dtr_records
      WHERE (employeeId = ? OR employeeId = ?) AND (date = ? OR date LIKE ?)
      ORDER BY date DESC LIMIT 1
    `).get(resolvedEmpId, employeeId, today, `${today}%`) as any;

    if (record && record.timeIn && !record.timeOut) {
      return res.json({
        clockedIn: true,
        timeIn: record.timeIn,
        date: record.date,
        recordId: record.id
      });
    }

    const latestPunch = await db.prepare(`
      SELECT * FROM dtr_logs
      WHERE employeeId = ? OR employeeId = ?
      ORDER BY timestamp DESC LIMIT 1
    `).get(resolvedEmpId, employeeId) as any;

    if (latestPunch && (latestPunch.type === 'in' || latestPunch.type === 'amin' || latestPunch.type === 'pmin')) {
      const punchDate = latestPunch.timestamp ? latestPunch.timestamp.split('T')[0] : today;
      if (punchDate === today) {
        return res.json({
          clockedIn: true,
          timeIn: latestPunch.timestamp,
          type: latestPunch.type,
          recordId: latestPunch.id
        });
      }
    }

    res.json(null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Employee Specific DTR Records
dtrRouter.get("/dtr/employee/:employeeId", async (req: any, res: any) => {
  try {
    const { employeeId } = req.params;
    const resolvedEmpId = await resolveEmployeeId(employeeId);
    const { startDate, endDate } = req.query;
    let query = `
      SELECT d.*, e.firstName, e.lastName, e.employeeId as employeeNo, e.category, e.campus
      FROM dtr_records d
      LEFT JOIN employees e ON d.employeeId = e.id
      WHERE (d.employeeId = ? OR d.employeeId = ?)
    `;
    const params: any[] = [resolvedEmpId, employeeId];

    if (startDate && endDate) {
      query += " AND d.date >= ? AND d.date <= ?";
      params.push(startDate, endDate);
    }

    query += " ORDER BY d.date DESC";
    const records = await db.prepare(query).all(...params);
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clock In Endpoint
dtrRouter.post("/dtr/clock-in", async (req: any, res: any) => {
  try {
    const { employeeId, time } = req.body;
    if (!employeeId) {
      return res.status(400).json({ error: "employeeId is required" });
    }

    const resolvedEmpId = await resolveEmployeeId(employeeId);
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = time || now.toTimeString().split(" ")[0].substring(0, 5); // HH:mm
    const logId = `punch-${Date.now()}`;
    const timestamp = now.toISOString();

    // Log punch
    await db.prepare(`
      INSERT INTO dtr_logs (id, employeeId, timestamp, type, source, notes)
      VALUES (?, ?, ?, 'in', 'web', 'Live Clock In')
    `).run(logId, resolvedEmpId, timestamp);

    // Update or create dtr_record
    const existing = await db.prepare(`
      SELECT * FROM dtr_records WHERE employeeId = ? AND date = ?
    `).get(resolvedEmpId, dateStr) as any;

    if (existing) {
      await db.prepare(`
        UPDATE dtr_records SET timeIn = COALESCE(timeIn, ?), status = 'regular' WHERE id = ?
      `).run(timeStr, existing.id);
    } else {
      const recId = `dtr-${Date.now()}`;
      await db.prepare(`
        INSERT INTO dtr_records (id, employeeId, date, timeIn, timeOut, hoursWorked, overtimeHours, status, notes)
        VALUES (?, ?, ?, ?, NULL, 0, 0, 'regular', 'Clocked in online')
      `).run(recId, resolvedEmpId, dateStr, timeStr);
    }

    await logAudit(req, "DTR_CLOCK_IN", `Employee ${resolvedEmpId} clocked in at ${timeStr}`);
    await syncActivePayrollCycles();
    res.json({ success: true, message: "Clocked in successfully", timeIn: timeStr, date: dateStr });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clock Out Endpoint
dtrRouter.post("/dtr/clock-out", async (req: any, res: any) => {
  try {
    const { employeeId, time } = req.body;
    if (!employeeId) {
      return res.status(400).json({ error: "employeeId is required" });
    }

    const resolvedEmpId = await resolveEmployeeId(employeeId);
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = time || now.toTimeString().split(" ")[0].substring(0, 5); // HH:mm
    const logId = `punch-${Date.now()}`;
    const timestamp = now.toISOString();

    // Log punch
    await db.prepare(`
      INSERT INTO dtr_logs (id, employeeId, timestamp, type, source, notes)
      VALUES (?, ?, ?, 'out', 'web', 'Live Clock Out')
    `).run(logId, resolvedEmpId, timestamp);

    // Update existing dtr_record
    const existing = await db.prepare(`
      SELECT * FROM dtr_records WHERE employeeId = ? AND date = ? ORDER BY date DESC LIMIT 1
    `).get(resolvedEmpId, dateStr) as any;

    let hrsWorked = 8.0;
    if (existing && existing.timeIn) {
      try {
        const [inH, inM] = existing.timeIn.split(":").map(Number);
        const [outH, outM] = timeStr.split(":").map(Number);
        const totalMinutes = (outH * 60 + outM) - (inH * 60 + inM);
        hrsWorked = Math.max(0, Number((totalMinutes / 60).toFixed(2)));
      } catch (e) {}

      await db.prepare(`
        UPDATE dtr_records SET timeOut = ?, hoursWorked = ? WHERE id = ?
      `).run(timeStr, hrsWorked, existing.id);
    } else {
      const recId = `dtr-${Date.now()}`;
      await db.prepare(`
        INSERT INTO dtr_records (id, employeeId, date, timeIn, timeOut, hoursWorked, overtimeHours, status, notes)
        VALUES (?, ?, ?, '08:00', ?, 8.0, 0, 'regular', 'Clocked out online')
      `).run(recId, resolvedEmpId, dateStr, timeStr);
    }

    await logAudit(req, "DTR_CLOCK_OUT", `Employee ${resolvedEmpId} clocked out at ${timeStr}`);
    await syncActivePayrollCycles();
    res.json({ success: true, message: "Clocked out successfully", timeOut: timeStr, date: dateStr });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manual DTR Record Entry
dtrRouter.post("/dtr/manual", async (req: any, res: any) => {
  try {
    const { employeeId, date, timeIn, timeOut, notes } = req.body;
    if (!employeeId || !date) {
      return res.status(400).json({ error: "employeeId and date are required" });
    }

    const resolvedEmpId = await resolveEmployeeId(employeeId);
    const dateClean = date.split("T")[0];
    let hrsWorked = 0;
    if (timeIn && timeOut) {
      try {
        const [inH, inM] = timeIn.split(":").map(Number);
        const [outH, outM] = timeOut.split(":").map(Number);
        const mins = (outH * 60 + outM) - (inH * 60 + inM);
        hrsWorked = Math.max(0, Number((mins / 60).toFixed(2)));
      } catch (e) {}
    }

    const id = `dtr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    await db.prepare(`
      INSERT INTO dtr_records (id, employeeId, date, timeIn, timeOut, hoursWorked, overtimeHours, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, 0, 'regular', ?)
    `).run(id, resolvedEmpId, dateClean, timeIn || null, timeOut || null, hrsWorked, notes || "");

    await syncActivePayrollCycles();
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Save Day Punches (AM/PM timesheet row updates)
dtrRouter.post("/dtr/save-day", async (req: any, res: any) => {
  try {
    const { employeeId, date, amIn, amOut, pmIn, pmOut, lateMinutes, undertimeMinutes, overtimeHours, notes, status } = req.body;
    if (!employeeId || !date) {
      return res.status(400).json({ error: "employeeId and date are required" });
    }

    const resolvedEmpId = await resolveEmployeeId(employeeId);
    const dateClean = date.split("T")[0];

    // Remove existing records and punch logs for this day
    try {
      await db.prepare("DELETE FROM dtr_records WHERE (employeeId = ? OR employeeId = ?) AND (date = ? OR date LIKE ?)").run(resolvedEmpId, employeeId, dateClean, `${dateClean}%`);
      await db.prepare("DELETE FROM dtr_logs WHERE (employeeId = ? OR employeeId = ?) AND (timestamp LIKE ? OR date LIKE ?)").run(resolvedEmpId, employeeId, `${dateClean}%`, `${dateClean}%`);
    } catch (cleanErr) {
      await db.prepare("DELETE FROM dtr_records WHERE (employeeId = ? OR employeeId = ?) AND date = ?").run(resolvedEmpId, employeeId, dateClean);
    }

    // Calculate hours
    let amHrs = 0;
    if (amIn && amOut) {
      const [inH, inM] = amIn.split(":").map(Number);
      const [outH, outM] = amOut.split(":").map(Number);
      amHrs = Math.max(0, ((outH * 60 + outM) - (inH * 60 + inM)) / 60);
    }
    let pmHrs = 0;
    if (pmIn && pmOut) {
      const [inH, inM] = pmIn.split(":").map(Number);
      const [outH, outM] = pmOut.split(":").map(Number);
      pmHrs = Math.max(0, ((outH * 60 + outM) - (inH * 60 + inM)) / 60);
    }

    const totalHours = Number((amHrs + pmHrs).toFixed(2));
    const effectiveIn = amIn || pmIn || null;
    const effectiveOut = pmOut || amOut || null;
    const otHrs = Number(overtimeHours || 0);
    const lateMin = Number(lateMinutes || 0);
    const underMin = Number(undertimeMinutes || 0);
    const isExplicitAbsent = status === 'absent';

    if (isExplicitAbsent || effectiveIn || effectiveOut || notes || amIn || amOut || pmIn || pmOut) {
      const id = `dtr-${Date.now()}`;
      await db.prepare(`
        INSERT INTO dtr_records (id, employeeId, date, timeIn, timeOut, amIn, amOut, pmIn, pmOut, hoursWorked, overtimeHours, lateMinutes, undertimeMinutes, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, resolvedEmpId, dateClean, effectiveIn, effectiveOut,
        amIn || null, amOut || null, pmIn || null, pmOut || null,
        isExplicitAbsent ? 0 : totalHours, otHrs, lateMin, underMin, isExplicitAbsent ? 'absent' : (status || 'regular'), notes || (isExplicitAbsent ? "Absent" : "")
      );
    }

    await syncActivePayrollCycles();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Simulate Month Timesheets
dtrRouter.post("/dtr/simulate", async (req: any, res: any) => {
  try {
    const { employeeId, year, month } = req.body;
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month) || (new Date().getMonth() + 1);
    const totalDays = new Date(y, m, 0).getDate();

    let employeesToSimulate: any[] = [];
    if (employeeId === 'all' || !employeeId) {
      employeesToSimulate = await db.prepare("SELECT * FROM employees WHERE status = 'active'").all() as any[];
    } else {
      const resolvedEmpId = await resolveEmployeeId(employeeId);
      employeesToSimulate = await db.prepare("SELECT * FROM employees WHERE id = ? OR id = ?").all(resolvedEmpId, employeeId) as any[];
    }

    let insertCount = 0;
    for (const emp of employeesToSimulate) {
      for (let d = 1; d <= totalDays; d++) {
        const dayDate = new Date(y, m - 1, d);
        const dayOfWeek = dayDate.getDay(); // 0 = Sun, 6 = Sat
        if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends

        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const existing = await db.prepare("SELECT id FROM dtr_records WHERE (employeeId = ? OR employeeId = ?) AND date = ?").get(emp.id, emp.id, dateStr);
        if (!existing) {
          const recId = `dtr-sim-${emp.id}-${dateStr}`;
          try {
            await db.prepare(`
              INSERT INTO dtr_records (id, employeeId, date, timeIn, timeOut, amIn, amOut, pmIn, pmOut, hoursWorked, overtimeHours, status, notes)
              VALUES (?, ?, ?, '08:00', '17:00', '08:00', '12:00', '13:00', '17:00', 8.0, 0, 'regular', 'Simulated Normal Attendance')
            `).run(recId, emp.id, dateStr);
          } catch (insertErr) {
            // Fallback for snake_case column names if table has legacy schema
            await db.prepare(`
              INSERT INTO dtr_records (id, employee_id, date, time_in, time_out, am_in, am_out, pm_in, pm_out, hours_worked, overtime_hours, status, notes)
              VALUES (?, ?, ?, '08:00', '17:00', '08:00', '12:00', '13:00', '17:00', 8.0, 0, 'regular', 'Simulated Normal Attendance')
            `).run(recId, emp.id, dateStr);
          }
          insertCount++;
        }
      }
    }

    await syncActivePayrollCycles();
    res.json({ success: true, count: insertCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clear Employee Month Logs
dtrRouter.delete("/dtr/clear/:employeeId/:yearMonth", async (req: any, res: any) => {
  try {
    const { employeeId, yearMonth } = req.params;
    const resolvedEmpId = await resolveEmployeeId(employeeId);
    await db.prepare(`
      DELETE FROM dtr_records
      WHERE (employeeId = ? OR employeeId = ?) AND date LIKE ?
    `).run(resolvedEmpId, employeeId, `${yearMonth}%`);
    await syncActivePayrollCycles();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

dtrRouter.put("/dtr/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { timeIn, timeOut, hoursWorked, overtimeHours, status, notes } = req.body;
    await db.prepare(`
      UPDATE dtr_records SET timeIn = ?, timeOut = ?, hoursWorked = ?, overtimeHours = ?, status = ?, notes = ?
      WHERE id = ?
    `).run(timeIn, timeOut, hoursWorked, overtimeHours, status || 'regular', notes || '', id);
    await syncActivePayrollCycles();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

dtrRouter.delete("/dtr/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM dtr_records WHERE id = ?").run(id);
    try {
      await db.prepare("DELETE FROM dtr_logs WHERE id = ?").run(id);
    } catch {}
    await syncActivePayrollCycles();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

dtrRouter.delete("/dtr/logs/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM dtr_logs WHERE id = ?").run(id);
    await syncActivePayrollCycles();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
