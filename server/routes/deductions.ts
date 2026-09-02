import { Router } from "express";
import { db, logAudit } from "../db/schema.js";
import { syncCurrentDeductionsToRecord, syncDeductionsToActivePayrollCycles } from "../services/payrollCalculator.js";

export const deductionsRouter = Router();

// Deduction Types CRUD
deductionsRouter.get("/deduction-types", async (req: any, res: any) => {
  try {
    const types = await db.prepare("SELECT * FROM deduction_types ORDER BY name ASC").all();
    res.json(types);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

deductionsRouter.post("/deduction-types", async (req: any, res: any) => {
  try {
    const { name, description } = req.body;
    const id = `dt-${Date.now()}`;
    await db.prepare("INSERT INTO deduction_types (id, name, description) VALUES (?, ?, ?)").run(id, name, description || "");
    res.json({ success: true, id, name, description });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

deductionsRouter.put("/deduction-types/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    await db.prepare("UPDATE deduction_types SET name = ?, description = ? WHERE id = ?").run(name, description || "", id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

deductionsRouter.delete("/deduction-types/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM deduction_types WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Deductions CRUD
deductionsRouter.get("/deductions", async (req: any, res: any) => {
  try {
    const { employeeId } = req.query;
    let query = `
      SELECT d.*, e.firstName, e.lastName, e.employeeId as employeeNo, e.campus
      FROM deductions d
      LEFT JOIN employees e ON (d."employeeId" = e.id OR d.employee_id = e.id OR d.employeeId = e.id)
    `;
    const params: any[] = [];

    if (employeeId) {
      query += ' WHERE (d."employeeId" = ? OR d.employee_id = ? OR d.employeeId = ?)';
      params.push(employeeId, employeeId, employeeId);
    }

    let deductions: any[] = [];
    try {
      deductions = await db.prepare(query + ' ORDER BY e.lastName ASC, d."createdAt" DESC').all(...params);
    } catch {
      try {
        deductions = await db.prepare(query + ' ORDER BY e.lastName ASC, d.created_at DESC').all(...params);
      } catch {
        try {
          deductions = await db.prepare(query + ' ORDER BY d.id DESC').all(...params);
        } catch {
          // Fallback query
          const rawDeds = await db.prepare("SELECT * FROM deductions").all() as any[];
          const emps = await db.prepare("SELECT * FROM employees").all() as any[];
          const empMap = new Map(emps.map(e => [e.id, e]));
          deductions = rawDeds.map(d => {
            const emp = empMap.get(d.employeeId || d.employee_id) || {};
            return {
              ...d,
              firstName: emp.firstName || emp.first_name || "",
              lastName: emp.lastName || emp.last_name || "",
              employeeNo: emp.employeeId || emp.employee_id || emp.bpno || "",
              campus: emp.campus || "",
              type: d.type || d.type_name || d.typeName || ""
            };
          });
        }
      }
    }

    // Ensure all items have normalized fields
    const normalized = deductions.map(d => ({
      ...d,
      type: d.type || d.type_name || d.typeName || "",
      typeName: d.typeName || d.type_name || d.type || "",
      employeeId: d.employeeId || d.employee_id || ""
    }));

    res.json(normalized);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

deductionsRouter.post("/deductions", async (req: any, res: any) => {
  try {
    const { employeeId, type, description, amount, status } = req.body;
    const id = `ded-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const parsedAmount = parseFloat(amount || 0) || 0;
    const itemStatus = status || "active";
    const itemDesc = description || type || "";
    const typeId = req.body.typeId || req.body.type_id || type || "ded_type";

    try {
      await db.prepare(`
        INSERT INTO deductions (id, "employeeId", employee_id, type_id, type, type_name, description, amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, employeeId, employeeId, typeId, type, type, itemDesc, parsedAmount, itemStatus);
    } catch {
      try {
        await db.prepare(`
          INSERT INTO deductions (id, employeeId, type, description, amount, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, employeeId, type, itemDesc, parsedAmount, itemStatus);
      } catch {
        await db.prepare(`
          INSERT INTO deductions (id, employee_id, type_id, type_name, description, amount)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, employeeId, typeId, type, itemDesc, parsedAmount);
      }
    }

    await syncCurrentDeductionsToRecord();
    await syncDeductionsToActivePayrollCycles(employeeId);
    await logAudit(req, "CREATE_DEDUCTION", `Added deduction of ₱${parsedAmount} (${type}) for employee ${employeeId}`);
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

deductionsRouter.put("/deductions/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { type, description, amount, status } = req.body;
    const parsedAmount = parseFloat(amount || 0) || 0;
    const itemStatus = status || "active";
    const itemDesc = description || type || "";
    const typeId = req.body.typeId || req.body.type_id || type || "ded_type";

    let employeeId: string | null = null;
    try {
      const ded = await db.prepare("SELECT * FROM deductions WHERE id = ?").get(id) as any;
      if (ded) {
        employeeId = ded.employeeId || ded.employee_id || null;
      }
    } catch {}

    try {
      await db.prepare(`
        UPDATE deductions SET
          type = ?,
          type_name = ?,
          type_id = ?,
          description = ?,
          amount = ?,
          status = ?
        WHERE id = ?
      `).run(type, type, typeId, itemDesc, parsedAmount, itemStatus, id);
    } catch {
      try {
        await db.prepare(`
          UPDATE deductions SET type = ?, description = ?, amount = ?, status = ?
          WHERE id = ?
        `).run(type, itemDesc, parsedAmount, itemStatus, id);
      } catch {
        await db.prepare(`
          UPDATE deductions SET type_name = ?, type_id = ?, description = ?, amount = ?
          WHERE id = ?
        `).run(type, typeId, itemDesc, parsedAmount, id);
      }
    }

    await syncCurrentDeductionsToRecord();
    if (employeeId) {
      await syncDeductionsToActivePayrollCycles(employeeId);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete single deduction
deductionsRouter.delete("/deductions/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    let employeeId: string | null = null;
    try {
      const ded = await db.prepare("SELECT * FROM deductions WHERE id = ?").get(id) as any;
      if (ded) {
        employeeId = ded.employeeId || ded.employee_id || null;
      }
    } catch {}

    await db.prepare("DELETE FROM deductions WHERE id = ?").run(id);
    await syncCurrentDeductionsToRecord();
    if (employeeId) {
      await syncDeductionsToActivePayrollCycles(employeeId);
    }
    await logAudit(req, "DELETE_DEDUCTION", `Deleted deduction ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk Import Deductions
deductionsRouter.post("/deductions/bulk", async (req: any, res: any) => {
  try {
    const rawList = Array.isArray(req.body) ? req.body : (req.body.deductions || req.body.data || []);
    if (!Array.isArray(rawList) || rawList.length === 0) {
      return res.status(400).json({ error: "No deduction items provided" });
    }

    let inserted = 0;
    let updated = 0;

    for (const item of rawList) {
      const empId = item.employeeId || item.employee_id;
      const typeName = item.type || item.typeName || item.type_name;
      if (!empId || !typeName) continue;

      const amount = Number(item.amount || 0);
      const desc = item.description || item.typeName || item.type || typeName || "";
      const status = item.status || "active";

      // Check if existing deduction for this employee and type exists
      let existing: any = null;
      try {
        existing = await db.prepare(
          'SELECT id FROM deductions WHERE ("employeeId" = ? OR employee_id = ? OR employeeId = ?) AND (type = ? OR type_name = ?)'
        ).get(empId, empId, empId, typeName, typeName) as any;
      } catch {
        try {
          existing = await db.prepare(
            "SELECT id FROM deductions WHERE employee_id = ? AND type_name = ?"
          ).get(empId, typeName) as any;
        } catch {}
      }

      const typeId = item.typeId || item.type_id || typeName || "ded_type";

      if (existing) {
        try {
          await db.prepare(
            "UPDATE deductions SET amount = ?, description = ?, status = ?, type = ?, type_name = ?, type_id = ? WHERE id = ?"
          ).run(amount, desc, status, typeName, typeName, typeId, existing.id);
        } catch {
          await db.prepare(
            "UPDATE deductions SET amount = ?, description = ? WHERE id = ?"
          ).run(amount, desc, existing.id);
        }
        updated++;
      } else {
        const id = `ded-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        try {
          await db.prepare(
            'INSERT INTO deductions (id, "employeeId", employee_id, type_id, type, type_name, description, amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(id, empId, empId, typeId, typeName, typeName, desc, amount, status);
        } catch {
          try {
            await db.prepare(
              "INSERT INTO deductions (id, employeeId, type, description, amount, status) VALUES (?, ?, ?, ?, ?, ?)"
            ).run(id, empId, typeName, desc, amount, status);
          } catch {
            await db.prepare(
              "INSERT INTO deductions (id, employee_id, type_id, type_name, description, amount) VALUES (?, ?, ?, ?, ?, ?)"
            ).run(id, empId, typeId, typeName, desc, amount);
          }
        }
        inserted++;
      }
    }

    await syncCurrentDeductionsToRecord();
    await syncDeductionsToActivePayrollCycles();
    await logAudit(req, "BULK_IMPORT_DEDUCTIONS", `Bulk imported deductions: ${inserted} created, ${updated} updated`);

    res.json({ success: true, count: inserted + updated, inserted, updated });
  } catch (err: any) {
    console.error("Bulk deductions import error:", err);
    res.status(500).json({ error: err.message || "Failed to bulk import deductions" });
  }
});

// Delete Deductions for specific employee
deductionsRouter.delete("/deductions/employee/:employeeId", async (req: any, res: any) => {
  try {
    const { employeeId } = req.params;
    try {
      await db.prepare('DELETE FROM deductions WHERE "employeeId" = ? OR employee_id = ? OR employeeId = ?').run(employeeId, employeeId, employeeId);
    } catch {
      await db.prepare("DELETE FROM deductions WHERE employee_id = ?").run(employeeId);
    }
    await syncCurrentDeductionsToRecord();
    await syncDeductionsToActivePayrollCycles(employeeId);
    await logAudit(req, "DELETE_EMPLOYEE_DEDUCTIONS", `Deleted all deductions for employee ${employeeId}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all deductions
deductionsRouter.delete("/deductions", async (req: any, res: any) => {
  try {
    await db.prepare("DELETE FROM deductions").run();
    await syncCurrentDeductionsToRecord();
    await syncDeductionsToActivePayrollCycles();
    await logAudit(req, "CLEAR_ALL_DEDUCTIONS", "Cleared all recurring deductions in system");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Deduction Records (Historical)
deductionsRouter.get("/deduction-records", async (req: any, res: any) => {
  try {
    await syncCurrentDeductionsToRecord();
    let rawRecords: any[] = [];
    try {
      rawRecords = await db.prepare("SELECT * FROM deduction_records ORDER BY year DESC, month DESC, createdAt DESC").all() as any[];
    } catch {
      try {
        rawRecords = await db.prepare("SELECT * FROM deduction_records ORDER BY year DESC, month DESC, created_at DESC").all() as any[];
      } catch {
        rawRecords = await db.prepare("SELECT * FROM deduction_records ORDER BY year DESC, month DESC, id DESC").all() as any[];
      }
    }
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

deductionsRouter.post("/deduction-records/save-current", async (req: any, res: any) => {
  try {
    const { year, month } = req.body;
    await syncCurrentDeductionsToRecord(year ? Number(year) : undefined, month ? Number(month) : undefined);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

deductionsRouter.put("/deduction-records/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { year, month, totalEmployees, totalDeductions, recordData } = req.body;
    const existing = await db.prepare("SELECT * FROM deduction_records WHERE id = ?").get(id) as any;
    if (!existing) return res.status(404).json({ error: "Record not found" });

    const jsonStr = recordData !== undefined ? JSON.stringify(recordData) : existing.recordDataJson;

    await db.prepare(`
      UPDATE deduction_records SET
        year = COALESCE(?, year),
        month = COALESCE(?, month),
        totalEmployees = COALESCE(?, totalEmployees),
        totalDeductions = COALESCE(?, totalDeductions),
        recordDataJson = ?,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(year, month, totalEmployees, totalDeductions, jsonStr, id);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

deductionsRouter.delete("/deduction-records/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM deduction_records WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

deductionsRouter.delete("/deduction-records", async (req: any, res: any) => {
  try {
    await db.prepare("DELETE FROM deduction_records").run();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Loans & Payments
deductionsRouter.get("/loans", async (req: any, res: any) => {
  try {
    const { employeeId } = req.query;
    let query = `
      SELECT l.*, e.firstName, e.lastName, e.employeeId as employeeNo, e.campus
      FROM loans l
      LEFT JOIN employees e ON (l."employeeId" = e.id OR l.employee_id = e.id OR l.employeeId = e.id)
    `;
    const params: any[] = [];

    if (employeeId) {
      query += ' WHERE (l."employeeId" = ? OR l.employee_id = ? OR l.employeeId = ?)';
      params.push(employeeId, employeeId, employeeId);
    }

    let loans: any[] = [];
    try {
      loans = await db.prepare(query + ' ORDER BY l."createdAt" DESC').all(...params);
    } catch {
      try {
        loans = await db.prepare(query + ' ORDER BY l.created_at DESC').all(...params);
      } catch {
        try {
          loans = await db.prepare(query + ' ORDER BY l.id DESC').all(...params);
        } catch {
          const rawLoans = await db.prepare("SELECT * FROM loans").all() as any[];
          const emps = await db.prepare("SELECT * FROM employees").all() as any[];
          const empMap = new Map(emps.map(e => [e.id, e]));
          loans = rawLoans.map(l => {
            const emp = empMap.get(l.employeeId || l.employee_id) || {};
            return {
              ...l,
              firstName: emp.firstName || emp.first_name || "",
              lastName: emp.lastName || emp.last_name || "",
              employeeNo: emp.employeeId || emp.employee_id || emp.bpno || "",
              campus: emp.campus || ""
            };
          });
        }
      }
    }
    res.json(loans);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

deductionsRouter.post("/loans", async (req: any, res: any) => {
  try {
    const { employeeId, loanType, principalAmount, totalAmount, monthlyAmortization, termMonths, remainingBalance, startDate, endDate, notes } = req.body;
    const id = `loan-${Date.now()}`;
    const pAmt = parseFloat(principalAmount || 0) || 0;
    const tAmt = parseFloat(totalAmount || principalAmount || 0) || pAmt;
    const mAmort = parseFloat(monthlyAmortization || 0) || 0;
    const tMonths = parseInt(termMonths || 12) || 12;
    const rBal = parseFloat(remainingBalance !== undefined ? remainingBalance : tAmt) || tAmt;

    try {
      await db.prepare(`
        INSERT INTO loans (id, "employeeId", employee_id, "loanType", loan_type, "principalAmount", principal_amount, "totalAmount", total_amount, "monthlyAmortization", monthly_amortization, "termMonths", term_months, "remainingBalance", remaining_balance, status, "startDate", start_date, "endDate", end_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
      `).run(id, employeeId, employeeId, loanType, loanType, pAmt, pAmt, tAmt, tAmt, mAmort, mAmort, tMonths, tMonths, rBal, rBal, startDate || null, startDate || null, endDate || null, endDate || null, notes || "");
    } catch {
      try {
        await db.prepare(`
          INSERT INTO loans (id, employeeId, loanType, principalAmount, totalAmount, monthlyAmortization, termMonths, remainingBalance, status, startDate, endDate, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
        `).run(id, employeeId, loanType, pAmt, tAmt, mAmort, tMonths, rBal, startDate || null, endDate || null, notes || "");
      } catch {
        await db.prepare(`
          INSERT INTO loans (id, employee_id, loan_type, principal_amount, total_amount, monthly_amortization, term_months, remaining_balance, status, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
        `).run(id, employeeId, loanType, pAmt, tAmt, mAmort, tMonths, rBal, notes || "");
      }
    }

    await syncDeductionsToActivePayrollCycles(employeeId);
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

deductionsRouter.delete("/loans/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    let employeeId: string | null = null;
    try {
      const loan = await db.prepare("SELECT * FROM loans WHERE id = ?").get(id) as any;
      if (loan) {
        employeeId = loan.employeeId || loan.employee_id || null;
      }
    } catch {}

    try {
      await db.prepare('DELETE FROM loan_payments WHERE "loanId" = ? OR loan_id = ? OR loanId = ?').run(id, id, id);
    } catch {}
    await db.prepare("DELETE FROM loans WHERE id = ?").run(id);

    if (employeeId) {
      await syncDeductionsToActivePayrollCycles(employeeId);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

deductionsRouter.post("/loans/:id/pay", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { amount, source, notes } = req.body;
    const payId = `pay-${Date.now()}`;
    const payAmount = Number(amount || 0);

    const loan = await db.prepare("SELECT * FROM loans WHERE id = ?").get(id) as any;
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    const currentBal = Number(loan.remainingBalance || loan.remaining_balance || 0);
    const newBalance = Math.max(0, Number((currentBal - payAmount).toFixed(2)));
    const newStatus = newBalance <= 0 ? 'completed' : 'active';

    try {
      await db.prepare(`
        INSERT INTO loan_payments (id, "loanId", loan_id, amount, "paymentDate", payment_date, source, notes)
        VALUES (?, ?, ?, ?, CURRENT_DATE, CURRENT_DATE, ?, ?)
      `).run(payId, id, id, payAmount, source || "manual", notes || "");
    } catch {
      await db.prepare(`
        INSERT INTO loan_payments (id, loanId, amount, paymentDate, source, notes)
        VALUES (?, ?, ?, CURRENT_DATE, ?, ?)
      `).run(payId, id, payAmount, source || "manual", notes || "");
    }

    try {
      await db.prepare('UPDATE loans SET "remainingBalance" = ?, remaining_balance = ?, status = ? WHERE id = ?').run(newBalance, newBalance, newStatus, id);
    } catch {
      await db.prepare("UPDATE loans SET remainingBalance = ?, status = ? WHERE id = ?").run(newBalance, newStatus, id);
    }

    const employeeId = loan.employeeId || loan.employee_id;
    if (employeeId) {
      await syncDeductionsToActivePayrollCycles(employeeId);
    }

    res.json({ success: true, newBalance, status: newStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
