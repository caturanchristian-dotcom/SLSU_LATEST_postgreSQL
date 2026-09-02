import { Router } from "express";
import { db, logAudit } from "../db/schema.js";
import { hasSupabaseConfig, syncUserToSupabase, deleteUserFromSupabase } from "../supabase.js";

export const employeesRouter = Router();

// Employee list & filtering
employeesRouter.get("/employees", async (req: any, res: any) => {
  try {
    const userRole = req.headers['x-user-role'] || req.headers['user-role'];
    const userCampus = req.headers['x-user-campus'] || req.headers['user-campus'];

    let query = "SELECT * FROM employees";
    let params: any[] = [];

    if (userRole === 'accountant' && userCampus && userCampus !== 'All Campuses') {
      query += " WHERE campus = ? OR campus IS NULL OR campus = ''";
      params.push(userCampus);
    }

    query += " ORDER BY lastName ASC, firstName ASC";
    const employees = await db.prepare(query).all(...params);
    res.json(employees);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.get("/employees/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const employee = await db.prepare("SELECT * FROM employees WHERE id = ?").get(id);
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    res.json(employee);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.post("/employees", async (req: any, res: any) => {
  try {
    const emp = req.body;
    const id = emp.id || `emp-${Date.now()}`;
    const employeeId = emp.employeeId || `EMP-${Date.now().toString().slice(-4)}`;

    await db.prepare(`
      INSERT INTO employees (
        id, employeeId, firstName, lastName, email, password, category, basicSalary,
        salaryType, status, phoneNumber, hireDate, hasSss, hasPhilhealth, hasPagibig,
        bpno, mi, prefix, appellation, birthDate, crn, effectivityDate, position,
        gender, profileImage, campus
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `).run(
      id, employeeId, emp.firstName || "", emp.lastName || "", emp.email || "", emp.password || "password123",
      emp.category || "STAFF", emp.basicSalary || 0,
      emp.salaryType || "monthly", emp.status || "active",
      emp.phoneNumber || "09171234567",
      emp.hireDate || new Date().toISOString().split('T')[0],
      emp.hasSss ? 1 : 0, emp.hasPhilhealth ? 1 : 0, emp.hasPagibig ? 1 : 0,
      emp.bpno || "", emp.mi || "", emp.prefix || "", emp.appellation || "",
      emp.birthDate || "", emp.crn || "",
      emp.effectivityDate || "",
      emp.position || "Staff", emp.gender || "MALE",
      emp.profileImage || "",
      emp.campus || "Hinunangan Campus"
    );

    // Also register user account
    if (emp.email) {
      const empEmail = emp.email.toLowerCase().trim();
      const empPassword = emp.password || "password123";
      const empName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || empEmail.split('@')[0];
      const empCampus = emp.campus || "Hinunangan Campus";

      await db.prepare(`
        INSERT OR IGNORE INTO users (id, email, password, displayName, role, campus)
        VALUES (?, ?, ?, ?, 'employee', ?)
      `).run(id, empEmail, empPassword, empName, empCampus);

      if (hasSupabaseConfig) {
        syncUserToSupabase({
          id,
          email: empEmail,
          password: empPassword,
          displayName: empName,
          role: "employee",
          campus: empCampus,
          profileImage: emp.profileImage || ""
        }).catch(err => console.error("[Employees] Supabase create sync error:", err));
      }
    }

    await logAudit(req, "CREATE_EMPLOYEE", `Created employee ${emp.firstName} ${emp.lastName} (${employeeId})`);
    res.json({ success: true, id, employeeId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk Import & Upsert Employees
employeesRouter.post("/employees/bulk", async (req: any, res: any) => {
  try {
    const rawList = Array.isArray(req.body) ? req.body : (req.body.employees || req.body.data || []);
    if (!Array.isArray(rawList) || rawList.length === 0) {
      return res.status(400).json({ error: "No employee data provided" });
    }

    const userCampus = req.headers['x-user-campus'] || req.headers['user-campus'] || "Hinunangan Campus";

    let insertedCount = 0;
    let updatedCount = 0;
    const skipped: any[] = [];

    // Fetch existing employees to match
    const existingEmployees = await db.prepare("SELECT * FROM employees").all() as any[];
    
    // Create lookup maps for fast matching
    const byIdMap = new Map<string, any>();
    const byEmployeeIdMap = new Map<string, any>();
    const byBpnoMap = new Map<string, any>();
    const byCrnMap = new Map<string, any>();
    const byNameMap = new Map<string, any>();

    for (const emp of existingEmployees) {
      if (emp.id) byIdMap.set(String(emp.id).toLowerCase().trim(), emp);
      if (emp.employeeId) byEmployeeIdMap.set(String(emp.employeeId).toLowerCase().trim(), emp);
      if (emp.bpno) byBpnoMap.set(String(emp.bpno).toLowerCase().trim(), emp);
      if (emp.crn) byCrnMap.set(String(emp.crn).toLowerCase().trim(), emp);
      if (emp.lastName && emp.firstName) {
        const key = `${emp.lastName.toLowerCase().trim()}_${emp.firstName.toLowerCase().trim()}`;
        byNameMap.set(key, emp);
      }
    }

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      if (!item || (!item.lastName && !item.firstName && !item.employeeId && !item.bpno)) {
        skipped.push({ row: i + 1, reason: "Empty or invalid record" });
        continue;
      }

      const lastName = String(item.lastName || '').trim();
      const firstName = String(item.firstName || '').trim();
      const bpno = String(item.bpno || '').trim();
      const crn = String(item.crn || '').trim();
      const employeeId = String(item.employeeId || bpno || `EMP-${Date.now().toString().slice(-4)}${i}`).trim();
      const nameKey = `${lastName.toLowerCase()}_${firstName.toLowerCase()}`;

      // Match existing
      let matched = null;
      if (item.id && byIdMap.has(String(item.id).toLowerCase().trim())) {
        matched = byIdMap.get(String(item.id).toLowerCase().trim());
      } else if (bpno && byBpnoMap.has(bpno.toLowerCase())) {
        matched = byBpnoMap.get(bpno.toLowerCase());
      } else if (employeeId && byEmployeeIdMap.has(employeeId.toLowerCase())) {
        matched = byEmployeeIdMap.get(employeeId.toLowerCase());
      } else if (crn && byCrnMap.has(crn.toLowerCase())) {
        matched = byCrnMap.get(crn.toLowerCase());
      } else if (lastName && firstName && byNameMap.has(nameKey)) {
        matched = byNameMap.get(nameKey);
      }

      const basicSalary = parseFloat(item.basicSalary) || (matched ? Number(matched.basicSalary) : 0);
      const position = item.position || (matched ? matched.position : "Staff");
      const category = item.category || (matched ? matched.category : "STAFF");
      const campus = item.campus || (matched ? matched.campus : userCampus);
      const cleanFirst = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanLast = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const email = (item.email || (matched ? matched.email : `${cleanFirst || 'user'}.${cleanLast || 'emp'}@school.edu`)).trim();
      const phone = item.phoneNumber || (matched ? matched.phoneNumber : "09171234567");
      const gender = item.gender || (matched ? matched.gender : "MALE");
      const effectivityDate = item.effectivityDate || (matched ? matched.effectivityDate : "");
      const birthDate = item.birthDate || (matched ? matched.birthDate : "");
      const mi = item.mi !== undefined ? String(item.mi).trim() : (matched ? matched.mi : "");
      const prefix = item.prefix !== undefined ? String(item.prefix).trim() : (matched ? matched.prefix : "");
      const appellation = item.appellation !== undefined ? String(item.appellation).trim() : (matched ? matched.appellation : "");
      const hasSss = item.hasSss !== undefined ? (item.hasSss ? 1 : 0) : (matched ? matched.hasSss : 1);
      const hasPhilhealth = item.hasPhilhealth !== undefined ? (item.hasPhilhealth ? 1 : 0) : (matched ? matched.hasPhilhealth : 1);
      const hasPagibig = item.hasPagibig !== undefined ? (item.hasPagibig ? 1 : 0) : (matched ? matched.hasPagibig : 1);

      if (matched) {
        // Update existing record
        await db.prepare(`
          UPDATE employees SET
            firstName = COALESCE(NULLIF(?, ''), firstName),
            lastName = COALESCE(NULLIF(?, ''), lastName),
            bpno = COALESCE(NULLIF(?, ''), bpno),
            crn = COALESCE(NULLIF(?, ''), crn),
            position = COALESCE(NULLIF(?, ''), position),
            category = COALESCE(NULLIF(?, ''), category),
            basicSalary = ?,
            effectivityDate = COALESCE(NULLIF(?, ''), effectivityDate),
            birthDate = COALESCE(NULLIF(?, ''), birthDate),
            mi = ?,
            prefix = ?,
            appellation = ?,
            gender = COALESCE(NULLIF(?, ''), gender),
            hasSss = ?,
            hasPhilhealth = ?,
            hasPagibig = ?,
            campus = COALESCE(NULLIF(?, ''), campus)
          WHERE id = ?
        `).run(
          firstName, lastName, bpno, crn, position, category, basicSalary,
          effectivityDate, birthDate, mi, prefix, appellation, gender,
          hasSss, hasPhilhealth, hasPagibig, campus, matched.id
        );

        if (email) {
          await db.prepare(`
            UPDATE users SET displayName = ?, campus = ? WHERE id = ? OR email = ?
          `).run(`${firstName || matched.firstName} ${lastName || matched.lastName}`.trim(), campus, matched.id, email.toLowerCase());
        }

        updatedCount++;
      } else {
        // Insert new record
        const newId = item.id || `emp-${Date.now()}-${i}`;
        const newEmpId = employeeId || `EMP-${Date.now().toString().slice(-4)}${i}`;
        const password = item.password || `${cleanLast || 'employee'}123`;

        await db.prepare(`
          INSERT INTO employees (
            id, employeeId, firstName, lastName, email, password, category, basicSalary,
            salaryType, status, phoneNumber, hireDate, hasSss, hasPhilhealth, hasPagibig,
            bpno, mi, prefix, appellation, birthDate, crn, effectivityDate, position,
            gender, profileImage, campus
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?
          )
        `).run(
          newId, newEmpId, firstName, lastName, email, password,
          category, basicSalary, item.salaryType || "monthly", item.status || "active",
          phone, item.hireDate || new Date().toISOString().split('T')[0],
          hasSss, hasPhilhealth, hasPagibig,
          bpno, mi, prefix, appellation,
          birthDate, crn, effectivityDate,
          position, gender, item.profileImage || "",
          campus
        );

        // Also create user login
        if (email) {
          const empEmail = email.toLowerCase().trim();
          const empDisplayName = `${firstName} ${lastName}`.trim() || empEmail.split('@')[0];
          await db.prepare(`
            INSERT OR IGNORE INTO users (id, email, password, displayName, role, campus)
            VALUES (?, ?, ?, ?, 'employee', ?)
          `).run(newId, empEmail, password, empDisplayName, campus);

          if (hasSupabaseConfig) {
            syncUserToSupabase({
              id: newId,
              email: empEmail,
              password,
              displayName: empDisplayName,
              role: "employee",
              campus,
              profileImage: item.profileImage || ""
            }).catch(err => console.error("[Employees] Bulk sync error:", err));
          }
        }

        insertedCount++;
      }
    }

    await logAudit(req, "BULK_IMPORT_EMPLOYEES", `Imported/Updated ${insertedCount + updatedCount} employees (${insertedCount} new, ${updatedCount} updated)`);

    res.json({
      success: true,
      count: insertedCount + updatedCount,
      insertedCount,
      updatedCount,
      skipped
    });
  } catch (err: any) {
    console.error("Bulk employee import error:", err);
    res.status(500).json({ error: err.message || "Failed to process bulk import" });
  }
});

employeesRouter.put("/employees/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const emp = req.body;

    await db.prepare(`
      UPDATE employees SET
        firstName = ?, lastName = ?, email = ?, category = ?, basicSalary = ?,
        salaryType = ?, status = ?, phoneNumber = ?, hireDate = ?, hasSss = ?,
        hasPhilhealth = ?, hasPagibig = ?, bpno = ?, mi = ?, prefix = ?,
        appellation = ?, birthDate = ?, crn = ?, effectivityDate = ?, position = ?,
        gender = ?, profileImage = ?, campus = ?
      WHERE id = ?
    `).run(
      emp.firstName, emp.lastName, emp.email, emp.category, emp.basicSalary,
      emp.salaryType, emp.status, emp.phoneNumber, emp.hireDate,
      emp.hasSss ? 1 : 0, emp.hasPhilhealth ? 1 : 0, emp.hasPagibig ? 1 : 0,
      emp.bpno, emp.mi, emp.prefix, emp.appellation, emp.birthDate,
      emp.crn, emp.effectivityDate, emp.position, emp.gender,
      emp.profileImage, emp.campus, id
    );

    if (emp.email) {
      const cleanEmpEmail = emp.email.toLowerCase().trim();
      const cleanDisplayName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
      await db.prepare(`
        UPDATE users SET email = ?, displayName = ?, campus = ? WHERE id = ?
      `).run(cleanEmpEmail, cleanDisplayName, emp.campus || 'Hinunangan Campus', id);

      if (hasSupabaseConfig) {
        syncUserToSupabase({
          id,
          email: cleanEmpEmail,
          displayName: cleanDisplayName,
          campus: emp.campus || 'Hinunangan Campus',
          profileImage: emp.profileImage || ""
        }).catch(err => console.error("[Employees] Update sync error:", err));
      }
    }

    await logAudit(req, "UPDATE_EMPLOYEE", `Updated employee profile for ID ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.delete("/employees/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const existing = await db.prepare("SELECT * FROM employees WHERE id = ?").get(id) as any;
    await db.prepare("DELETE FROM employees WHERE id = ?").run(id);
    await db.prepare("DELETE FROM users WHERE id = ?").run(id);

    if (hasSupabaseConfig && existing?.email) {
      deleteUserFromSupabase(existing.email).catch(err => console.error("[Employees] Delete sync error:", err));
    }

    await logAudit(req, "DELETE_EMPLOYEE", `Deleted employee with ID ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.post("/employees/:id/upload-image", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { profileImage } = req.body;
    await db.prepare("UPDATE employees SET profileImage = ? WHERE id = ?").run(profileImage, id);
    await db.prepare("UPDATE users SET profileImage = ? WHERE id = ?").run(profileImage, id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Departments
employeesRouter.get("/departments", async (req: any, res: any) => {
  try {
    const depts = await db.prepare(`
      SELECT d.*, u.displayName as headName, u.email as headEmail
      FROM departments d
      LEFT JOIN users u ON d.departmentHeadId = u.id
      ORDER BY d.name ASC
    `).all();
    res.json(depts);
  } catch (err: any) {
    try {
      const fallbackDepts = await db.prepare("SELECT * FROM departments ORDER BY name ASC").all();
      res.json(fallbackDepts);
    } catch (fallbackErr: any) {
      res.status(500).json({ error: err.message });
    }
  }
});

employeesRouter.get("/department-heads", async (req: any, res: any) => {
  try {
    // Return all users with role 'department_head' or 'admin' eligible to be department heads
    const heads = await db.prepare(`
      SELECT id, email, displayName, role, campus
      FROM users
      WHERE role IN ('department_head', 'admin')
      ORDER BY displayName ASC
    `).all();
    res.json(heads);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.post("/departments", async (req: any, res: any) => {
  try {
    const { name, code, description, departmentHeadId, campus } = req.body;
    const id = `dept-${Date.now()}`;
    const headId = (!departmentHeadId || departmentHeadId === 'none') ? null : departmentHeadId;
    const campusVal = campus || "Hinunangan Campus";
    try {
      await db.prepare("INSERT INTO departments (id, name, code, description, departmentHeadId, campus) VALUES (?, ?, ?, ?, ?, ?)").run(
        id, name, code || "", description || "", headId, campusVal
      );
    } catch {
      await db.prepare("INSERT INTO departments (id, name, code, description, departmentHeadId) VALUES (?, ?, ?, ?, ?)").run(
        id, name, code || "", description || "", headId
      );
    }
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.put("/departments/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { name, code, description, departmentHeadId, campus } = req.body;
    const headId = (!departmentHeadId || departmentHeadId === 'none') ? null : departmentHeadId;
    const campusVal = campus || "Hinunangan Campus";
    try {
      await db.prepare("UPDATE departments SET name = ?, code = ?, description = ?, departmentHeadId = ?, campus = ? WHERE id = ?").run(
        name, code || "", description || "", headId, campusVal, id
      );
    } catch {
      await db.prepare("UPDATE departments SET name = ?, code = ?, description = ?, departmentHeadId = ? WHERE id = ?").run(
        name, code || "", description || "", headId, id
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.delete("/departments/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM departments WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Teaching Departments
employeesRouter.get("/teaching-departments", async (req: any, res: any) => {
  try {
    const tDepts = await db.prepare("SELECT * FROM teaching_departments ORDER BY name ASC").all();
    res.json(tDepts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.post("/teaching-departments", async (req: any, res: any) => {
  try {
    const { name, code, description } = req.body;
    const id = `tdept-${Date.now()}`;
    await db.prepare("INSERT INTO teaching_departments (id, name, code, description) VALUES (?, ?, ?, ?)").run(id, name, code, description || "");
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.put("/teaching-departments/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { name, code, description } = req.body;
    await db.prepare("UPDATE teaching_departments SET name = ?, code = ?, description = ? WHERE id = ?").run(name, code, description || "", id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.delete("/teaching-departments/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM teaching_departments WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Subjects
employeesRouter.get("/subjects", async (req: any, res: any) => {
  try {
    const rawSubs = await db.prepare(`
      SELECT s.*, d.name as departmentName, d.code as departmentCode, td.name as teachingDepartmentName
      FROM subjects s
      LEFT JOIN departments d ON (s.departmentId = d.id OR s.department_id = d.id)
      LEFT JOIN teaching_departments td ON (s.teachingDepartmentId = td.id OR s.teaching_department_id = td.id)
      ORDER BY s.code ASC
    `).all();
    const subs = (rawSubs || []).map((s: any) => ({
      ...s,
      name: s.name || s.title || s.code || "",
      title: s.title || s.name || s.code || ""
    }));
    res.json(subs);
  } catch (err: any) {
    try {
      const rawSubs = await db.prepare("SELECT * FROM subjects ORDER BY code ASC").all();
      const subs = (rawSubs || []).map((s: any) => ({
        ...s,
        name: s.name || s.title || s.code || "",
        title: s.title || s.name || s.code || ""
      }));
      res.json(subs);
    } catch (fallbackErr: any) {
      res.status(500).json({ error: err.message });
    }
  }
});

employeesRouter.post("/subjects", async (req: any, res: any) => {
  try {
    const { code, title, name, units, departmentId, teachingDepartmentId, description } = req.body;
    const id = `subj-${Date.now()}`;
    const subjectTitle = title || name || code;
    try {
      await db.prepare("INSERT INTO subjects (id, code, title, name, units, departmentId, teachingDepartmentId, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        id, code, subjectTitle, subjectTitle, units || 3, departmentId || null, teachingDepartmentId || null, description || ""
      );
    } catch {
      await db.prepare("INSERT INTO subjects (id, code, title, units, departmentId, teachingDepartmentId, description) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        id, code, subjectTitle, units || 3, departmentId || null, teachingDepartmentId || null, description || ""
      );
    }
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.put("/subjects/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { code, title, name, units, departmentId, teachingDepartmentId, description } = req.body;
    const subjectTitle = title || name || code;
    try {
      await db.prepare("UPDATE subjects SET code = ?, title = ?, name = ?, units = ?, departmentId = ?, teachingDepartmentId = ?, description = ? WHERE id = ?").run(
        code, subjectTitle, subjectTitle, units || 3, departmentId || null, teachingDepartmentId || null, description || "", id
      );
    } catch {
      await db.prepare("UPDATE subjects SET code = ?, title = ?, units = ?, departmentId = ?, teachingDepartmentId = ?, description = ? WHERE id = ?").run(
        code, subjectTitle, units || 3, departmentId || null, teachingDepartmentId || null, description || "", id
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.delete("/subjects/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM subjects WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Visiting Instructors
employeesRouter.get("/visiting-instructors", async (req: any, res: any) => {
  try {
    const vi = await db.prepare(`
      SELECT v.*, e.firstName, e.lastName, e.employeeId as employeeNo, e.email, e.campus
      FROM visiting_instructors v
      JOIN employees e ON v.employeeId = e.id
    `).all();
    res.json(vi);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Teaching Loads
employeesRouter.get("/teaching-loads", async (req: any, res: any) => {
  try {
    const loads = await db.prepare(`
      SELECT tl.*, s.code as subjectCode, s.title as subjectTitle, e.firstName, e.lastName
      FROM teaching_loads tl
      LEFT JOIN subjects s ON tl.subjectId = s.id
      LEFT JOIN employees e ON tl.employeeId = e.id
    `).all();
    res.json(loads);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.post("/teaching-loads", async (req: any, res: any) => {
  try {
    const { employeeId, subjectId, section, days, startTime, endTime, room, hoursPerWeek, semester, academicYear } = req.body;
    const id = `tl-${Date.now()}`;
    await db.prepare(`
      INSERT INTO teaching_loads (id, employeeId, subjectId, section, days, startTime, endTime, room, hoursPerWeek, semester, academicYear)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, employeeId, subjectId, section || "", days || "", startTime || "", endTime || "", room || "", hoursPerWeek || 3, semester || "1st Semester", academicYear || "2025-2026");
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.put("/teaching-loads/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { subjectId, section, days, startTime, endTime, room, hoursPerWeek, semester, academicYear } = req.body;
    await db.prepare(`
      UPDATE teaching_loads SET subjectId = ?, section = ?, days = ?, startTime = ?, endTime = ?, room = ?, hoursPerWeek = ?, semester = ?, academicYear = ?
      WHERE id = ?
    `).run(subjectId, section, days, startTime, endTime, room, hoursPerWeek, semester, academicYear, id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.delete("/teaching-loads/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM teaching_loads WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Holidays
employeesRouter.get("/holidays", async (req: any, res: any) => {
  try {
    const hols = await db.prepare("SELECT * FROM holidays ORDER BY date ASC").all();
    res.json(hols);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.post("/holidays", async (req: any, res: any) => {
  try {
    const { name, date, type } = req.body;
    const id = `hol-${Date.now()}`;
    await db.prepare("INSERT INTO holidays (id, name, date, type) VALUES (?, ?, ?, ?)").run(id, name, date, type || "Regular");
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.put("/holidays/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { name, date, type } = req.body;
    await db.prepare("UPDATE holidays SET name = ?, date = ?, type = ? WHERE id = ?").run(name, date, type, id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.delete("/holidays/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM holidays WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Schedules
employeesRouter.get("/schedules", async (req: any, res: any) => {
  try {
    const { employeeId } = req.query;
    let query = "SELECT * FROM schedules";
    const params: any[] = [];
    if (employeeId) {
      query += " WHERE (employeeId = ? OR employee_id = ? OR employeeid = ?)";
      params.push(employeeId, employeeId, employeeId);
    }
    query += " ORDER BY dayOfWeek ASC, startTime ASC";
    const scheds = await db.prepare(query).all(...params);
    res.json(scheds);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.get("/schedules/employee/:employeeId", async (req: any, res: any) => {
  try {
    const { employeeId } = req.params;
    const scheds = await db.prepare("SELECT * FROM schedules WHERE (employeeId = ? OR employee_id = ? OR employeeid = ?) ORDER BY dayOfWeek ASC, startTime ASC").all(employeeId, employeeId, employeeId);
    res.json(scheds);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.get("/schedules/department/:departmentId", async (req: any, res: any) => {
  try {
    const { departmentId } = req.params;
    const scheds = await db.prepare(`
      SELECT s.* FROM schedules s
      WHERE s.subject IN (SELECT code FROM subjects WHERE departmentId = ? OR department_id = ?)
         OR s.employeeId IN (SELECT id FROM employees WHERE category = (SELECT name FROM departments WHERE id = ?))
         OR s.employee_id IN (SELECT id FROM employees WHERE category = (SELECT name FROM departments WHERE id = ?))
      ORDER BY s.dayOfWeek ASC, s.startTime ASC
    `).all(departmentId, departmentId, departmentId, departmentId);
    res.json(scheds);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.get("/schedules/teaching-department/:teachingDepartmentId", async (req: any, res: any) => {
  try {
    const { teachingDepartmentId } = req.params;
    const scheds = await db.prepare(`
      SELECT s.* FROM schedules s
      WHERE s.subject IN (SELECT code FROM subjects WHERE teachingDepartmentId = ? OR teaching_department_id = ?)
         OR s.employeeId IN (SELECT id FROM employees WHERE category LIKE '%Faculty%')
         OR s.employee_id IN (SELECT id FROM employees WHERE category LIKE '%Faculty%')
      ORDER BY s.dayOfWeek ASC, s.startTime ASC
    `).all(teachingDepartmentId, teachingDepartmentId);
    res.json(scheds);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.post("/schedules", async (req: any, res: any) => {
  try {
    const { employeeId, dayOfWeek, startTime, endTime, timeIn, timeOut, subject, room, specificDate, effectiveFrom, effectiveTo } = req.body;
    const id = `sched-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const tIn = timeIn || startTime || "08:00";
    const tOut = timeOut || endTime || "17:00";
    const sTime = startTime || tIn;
    const eTime = endTime || tOut;
    const dWeek = dayOfWeek || "";

    try {
      await db.prepare(`
        INSERT INTO schedules (
          id, employeeId, dayOfWeek, startTime, endTime, timeIn, timeOut,
          subject, room, specificDate, effectiveFrom, effectiveTo,
          dayofweek, starttime, endtime, timein, timeout, specificdate, effectivefrom, effectiveto, employee_id, employeeid
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, employeeId, dWeek, sTime, eTime, tIn, tOut,
        subject || "", room || "", specificDate || null, effectiveFrom || null, effectiveTo || null,
        dWeek, sTime, eTime, tIn, tOut, specificDate || null, effectiveFrom || null, effectiveTo || null, employeeId, employeeId
      );
    } catch {
      await db.prepare(`
        INSERT INTO schedules (id, employeeId, dayOfWeek, startTime, endTime, timeIn, timeOut, subject, room, specificDate, effectiveFrom, effectiveTo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, employeeId, dWeek, sTime, eTime, tIn, tOut, subject || "", room || "", specificDate || null, effectiveFrom || null, effectiveTo || null
      );
    }
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.put("/schedules/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { employeeId, dayOfWeek, startTime, endTime, timeIn, timeOut, subject, room, specificDate, effectiveFrom, effectiveTo } = req.body;
    const tIn = timeIn || startTime || "08:00";
    const tOut = timeOut || endTime || "17:00";
    const sTime = startTime || tIn;
    const eTime = endTime || tOut;
    const dWeek = dayOfWeek || "";

    try {
      await db.prepare(`
        UPDATE schedules
        SET dayOfWeek = ?, startTime = ?, endTime = ?, timeIn = ?, timeOut = ?, subject = ?, room = ?, specificDate = ?, effectiveFrom = ?, effectiveTo = ?,
            dayofweek = ?, starttime = ?, endtime = ?, timein = ?, timeout = ?, specificdate = ?, effectivefrom = ?, effectiveto = ?
        WHERE id = ?
      `).run(
        dWeek, sTime, eTime, tIn, tOut, subject || "", room || "", specificDate || null, effectiveFrom || null, effectiveTo || null,
        dWeek, sTime, eTime, tIn, tOut, specificDate || null, effectiveFrom || null, effectiveTo || null,
        id
      );
    } catch {
      await db.prepare(`
        UPDATE schedules
        SET dayOfWeek = ?, startTime = ?, endTime = ?, timeIn = ?, timeOut = ?, subject = ?, room = ?, specificDate = ?, effectiveFrom = ?, effectiveTo = ?
        WHERE id = ?
      `).run(dWeek, sTime, eTime, tIn, tOut, subject || "", room || "", specificDate || null, effectiveFrom || null, effectiveTo || null, id);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.delete("/schedules/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM schedules WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Leaves
employeesRouter.get(["/leave-applications", "/leaves"], async (req: any, res: any) => {
  try {
    const leaves = await db.prepare(`
      SELECT l.*, e.firstName, e.lastName, e.employeeId as employeeNo
      FROM leave_applications l
      JOIN employees e ON l.employeeId = e.id
      ORDER BY l.createdAt DESC
    `).all();
    res.json(leaves);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.post(["/leave-applications", "/leaves"], async (req: any, res: any) => {
  try {
    const { employeeId, leaveType, startDate, endDate, daysCount, reason } = req.body;
    const id = `leave-${Date.now()}`;
    await db.prepare(`
      INSERT INTO leave_applications (id, employeeId, leaveType, startDate, endDate, daysCount, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, employeeId, leaveType, startDate, endDate, daysCount || 1, reason || "");
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.put(["/leave-applications/:id/status", "/leaves/:id/status"], async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason, reviewedBy } = req.body;
    await db.prepare(`
      UPDATE leave_applications SET status = ?, rejectionReason = ?, reviewedBy = ?, reviewedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, rejectionReason || "", reviewedBy || "HR Officer", id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.delete(["/leave-applications/:id", "/leaves/:id"], async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM leave_applications WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Employee Positions
employeesRouter.get("/employee-positions", async (req: any, res: any) => {
  try {
    const positions = await db.prepare("SELECT * FROM employee_positions ORDER BY name ASC").all();
    res.json(positions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.post("/employee-positions", async (req: any, res: any) => {
  try {
    const { name, description } = req.body;
    const id = `pos-${Date.now()}`;
    await db.prepare("INSERT INTO employee_positions (id, name, description) VALUES (?, ?, ?)").run(id, name, description || "");
    res.json({ success: true, id, name, description });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.put("/employee-positions/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    await db.prepare("UPDATE employee_positions SET name = ?, description = ? WHERE id = ?").run(name, description || "", id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.delete("/employee-positions/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM employee_positions WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Employee Categories
employeesRouter.get("/employee-categories", async (req: any, res: any) => {
  try {
    const categories = await db.prepare("SELECT * FROM employee_categories ORDER BY name ASC").all();
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.post("/employee-categories", async (req: any, res: any) => {
  try {
    const { name, description } = req.body;
    const id = `cat-${Date.now()}`;
    await db.prepare("INSERT INTO employee_categories (id, name, description) VALUES (?, ?, ?)").run(id, name, description || "");
    res.json({ success: true, id, name, description });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.put("/employee-categories/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    await db.prepare("UPDATE employee_categories SET name = ?, description = ? WHERE id = ?").run(name, description || "", id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.delete("/employee-categories/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await db.prepare("DELETE FROM employee_categories WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Employee History Endpoints
employeesRouter.get("/employees/:id/payroll-history", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const history = await db.prepare(`
      SELECT 
        pe.id,
        pe.cycleId,
        pe.employeeId,
        pe.employeeName,
        pe.basicPay,
        pe.grossPay,
        pe.totalDeductions,
        pe.netPay,
        pe.status,
        pe.bonuses,
        pe.allowances,
        pe.overtime,
        pc.name as cycleName,
        pc.startDate,
        pc.endDate,
        pc.startDate as periodStart,
        pc.endDate as periodEnd,
        pc.status as cycleStatus
      FROM payroll_entries pe
      LEFT JOIN payroll_cycles pc ON pe.cycleId = pc.id
      WHERE pe.employeeId = ?
      ORDER BY pc.endDate DESC, pe.id DESC
    `).all(id);
    res.json(history || []);
  } catch (err: any) {
    console.error("Error fetching employee payroll history:", err);
    res.status(500).json({ error: err.message });
  }
});

employeesRouter.get("/employees/:id/deduction-history", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const deds = await db.prepare(`
      SELECT d.*, dt.name as typeName
      FROM deductions d
      LEFT JOIN deduction_types dt ON d.type = dt.id OR d.type = dt.name
      WHERE d.employeeId = ?
      ORDER BY d.createdAt DESC
    `).all(id);
    res.json(deds || []);
  } catch (err: any) {
    console.error("Error fetching employee deduction history:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete All Employees (Reset/Admin)
employeesRouter.delete("/employees/delete/all", async (req: any, res: any) => {
  try {
    await db.prepare("DELETE FROM deductions").run();
    await db.prepare("DELETE FROM schedules").run();
    await db.prepare("DELETE FROM leave_applications").run();
    await db.prepare("DELETE FROM teaching_loads").run();
    await db.prepare("DELETE FROM visiting_instructors").run();
    await db.prepare("DELETE FROM employees").run();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
