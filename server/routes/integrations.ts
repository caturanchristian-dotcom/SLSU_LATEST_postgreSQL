import { Router } from "express";
import { db, logAudit } from "../db/schema.js";
import { broadcastRealtime } from "../index.js";

export const integrationsRouter = Router();

// Helper: Calculate worked hours and late/undertime minutes
function calculateDtrMetrics(
  timeIn: string,
  timeOut: string,
  amIn?: string,
  amOut?: string,
  pmIn?: string,
  pmOut?: string
) {
  let totalHours = 0;
  let lateMins = 0;
  let undertimeMins = 0;

  const parseMins = (tStr: string): number | null => {
    if (!tStr) return null;
    const parts = tStr.trim().split(":");
    if (parts.length < 2) return null;
    let h = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };

  // If 4-column attendance (AM/PM)
  if (amIn && amOut) {
    const amStart = parseMins(amIn);
    const amEnd = parseMins(amOut);
    if (amStart !== null && amEnd !== null && amEnd > amStart) {
      totalHours += (amEnd - amStart) / 60;
      // Standard AM start: 08:00 (480 mins)
      if (amStart > 480) lateMins += (amStart - 480);
      // Standard AM end: 12:00 (720 mins)
      if (amEnd < 720) undertimeMins += (720 - amEnd);
    }
  }

  if (pmIn && pmOut) {
    const pmStart = parseMins(pmIn);
    const pmEnd = parseMins(pmOut);
    if (pmStart !== null && pmEnd !== null && pmEnd > pmStart) {
      totalHours += (pmEnd - pmStart) / 60;
      // Standard PM start: 13:00 (780 mins)
      if (pmStart > 780) lateMins += (pmStart - 780);
      // Standard PM end: 17:00 (1020 mins)
      if (pmEnd < 1020) undertimeMins += (1020 - pmEnd);
    }
  }

  // Fallback to simple timeIn / timeOut if 4-column is not provided
  if (totalHours === 0 && timeIn && timeOut) {
    const start = parseMins(timeIn);
    const end = parseMins(timeOut);
    if (start !== null && end !== null && end > start) {
      let rawHrs = (end - start) / 60;
      // Subtract 1 hour lunch break if spans over lunch
      if (start <= 720 && end >= 780) {
        rawHrs = Math.max(0, rawHrs - 1);
      }
      totalHours = rawHrs;
      if (start > 480) lateMins += (start - 480);
      if (end < 1020) undertimeMins += (1020 - end);
    }
  }

  const standardDayHours = 8.0;
  const overtimeHours = totalHours > standardDayHours ? Number((totalHours - standardDayHours).toFixed(2)) : 0;

  return {
    hoursWorked: Number(Math.min(totalHours, standardDayHours).toFixed(2)),
    overtimeHours,
    lateMinutes: Math.max(0, lateMins),
    undertimeMinutes: Math.max(0, undertimeMins)
  };
}

// Helper to resolve employee database ID
async function findEmployee(idOrNoOrEmail: string): Promise<any | null> {
  if (!idOrNoOrEmail) return null;
  const clean = String(idOrNoOrEmail).trim();
  try {
    const emp = await db.prepare(`
      SELECT * FROM employees 
      WHERE id = ? OR employeeId = ? OR LOWER(email) = LOWER(?)
      LIMIT 1
    `).get(clean, clean, clean) as any;
    return emp || null;
  } catch (e) {
    return null;
  }
}

// Helper to log sync operation into integration_sync_logs
async function logSyncResult(
  module: string,
  status: "success" | "failed" | "in_progress",
  recordsReceived: number,
  recordsCreated: number,
  recordsUpdated: number,
  recordsFailed: number,
  message: string,
  details: any = {},
  initiatedBy = "admin",
  durationMs = 0
) {
  try {
    const logId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    await db.prepare(`
      INSERT INTO integration_sync_logs (
        id, module, status, recordsReceived, recordsCreated, recordsUpdated,
        recordsFailed, message, detailsJson, initiatedBy, durationMs, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      logId, module, status, recordsReceived, recordsCreated, recordsUpdated,
      recordsFailed, message, JSON.stringify(details), initiatedBy, durationMs
    );
  } catch (err: any) {
    console.error("[Integrations] Failed to write sync log:", err.message);
  }
}

// Helper to get configuration setting
async function getSetting(key: string, fallback = ""): Promise<string> {
  try {
    const row = await db.prepare("SELECT value FROM payroll_settings WHERE `key` = ?").get(key) as any;
    if (row && row.value) return row.value;
  } catch (e) {}
  return process.env[key.toUpperCase()] || fallback;
}

// Helper to save configuration setting
async function setSetting(key: string, value: string, description = ""): Promise<void> {
  const id = `set-${key}`;
  await db.prepare(`
    INSERT OR REPLACE INTO payroll_settings (id, \`key\`, value, description, updatedAt)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(id, key, value, description);
}

// -------------------------------------------------------------
// 1. Configuration & Health Endpoints
// -------------------------------------------------------------

// GET /api/integrations/config
integrationsRouter.get("/integrations/config", async (req: any, res: any) => {
  try {
    const baseUrl = await getSetting("school_api_base_url", process.env.SCHOOL_API_BASE_URL || "");
    const apiKey = await getSetting("school_api_key", process.env.SCHOOL_API_KEY || "");
    const bearerToken = await getSetting("school_api_bearer_token", process.env.SCHOOL_API_BEARER_TOKEN || "");
    const webhookSecret = await getSetting("school_webhook_secret", process.env.SCHOOL_WEBHOOK_SECRET || "slsu_secure_webhook_2026");
    const autoSync = (await getSetting("school_auto_sync_enabled", "false")) === "true";
    const syncInterval = await getSetting("school_sync_interval_mins", "60");

    const endpointEmployees = await getSetting("school_endpoint_employees", "/api/v1/employees");
    const endpointDtr = await getSetting("school_endpoint_dtr", "/api/v1/dtr");
    const endpointSchedules = await getSetting("school_endpoint_schedules", "/api/v1/schedules");

    // Mask secret values for security
    const mask = (val: string) => (val && val.length > 6 ? `${val.slice(0, 3)}****${val.slice(-3)}` : (val ? "******" : ""));

    res.json({
      baseUrl,
      apiKey: mask(apiKey),
      hasApiKey: !!apiKey,
      bearerToken: mask(bearerToken),
      hasBearerToken: !!bearerToken,
      webhookSecret: mask(webhookSecret),
      hasWebhookSecret: !!webhookSecret,
      autoSync,
      syncInterval: parseInt(syncInterval, 10) || 60,
      endpoints: {
        employees: endpointEmployees,
        dtr: endpointDtr,
        schedules: endpointSchedules
      },
      webhookUrls: {
        dtrPunch: `${req.protocol}://${req.get("host")}/api/integrations/webhook/dtr-punch`,
        employeeUpdate: `${req.protocol}://${req.get("host")}/api/integrations/webhook/employee-update`
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/integrations/config
integrationsRouter.post("/integrations/config", async (req: any, res: any) => {
  try {
    const {
      baseUrl,
      apiKey,
      bearerToken,
      webhookSecret,
      autoSync,
      syncInterval,
      endpoints
    } = req.body;

    if (baseUrl !== undefined) await setSetting("school_api_base_url", baseUrl.trim(), "School API Base URL");
    if (apiKey && !apiKey.includes("****")) await setSetting("school_api_key", apiKey.trim(), "School API Access Key");
    if (bearerToken && !bearerToken.includes("****")) await setSetting("school_api_bearer_token", bearerToken.trim(), "School API Bearer Token");
    if (webhookSecret && !webhookSecret.includes("****")) await setSetting("school_webhook_secret", webhookSecret.trim(), "Webhook Signature Secret");
    if (autoSync !== undefined) await setSetting("school_auto_sync_enabled", String(autoSync), "Auto Sync Enabled");
    if (syncInterval !== undefined) await setSetting("school_sync_interval_mins", String(syncInterval), "Sync Interval (Minutes)");

    if (endpoints) {
      if (endpoints.employees) await setSetting("school_endpoint_employees", endpoints.employees.trim(), "Employees API Endpoint");
      if (endpoints.dtr) await setSetting("school_endpoint_dtr", endpoints.dtr.trim(), "DTR API Endpoint");
      if (endpoints.schedules) await setSetting("school_endpoint_schedules", endpoints.schedules.trim(), "Schedules API Endpoint");
    }

    await logAudit(req, "UPDATE_INTEGRATION_CONFIG", "Updated School API integration settings");
    res.json({ success: true, message: "School API settings saved successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/integrations/test-connection
integrationsRouter.post("/integrations/test-connection", async (req: any, res: any) => {
  const startTime = Date.now();
  try {
    let { targetUrl, apiKey, bearerToken } = req.body;

    if (!targetUrl) {
      targetUrl = await getSetting("school_api_base_url", process.env.SCHOOL_API_BASE_URL || "");
    }
    if (!apiKey) {
      apiKey = await getSetting("school_api_key", process.env.SCHOOL_API_KEY || "");
    }
    if (!bearerToken) {
      bearerToken = await getSetting("school_api_bearer_token", process.env.SCHOOL_API_BEARER_TOKEN || "");
    }

    if (!targetUrl) {
      return res.status(400).json({
        success: false,
        error: "Please provide a School API Base URL (e.g., https://portal.slsu.edu.ph/api or use internal mock)"
      });
    }

    // Prepare headers
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "User-Agent": "SLSU-Payroll-Sync-Client/1.0"
    };
    if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
    if (apiKey) headers["X-API-Key"] = apiKey;

    // Test ping
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(targetUrl, {
        method: "GET",
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      let responsePreview: any = null;
      try {
        responsePreview = await response.json();
      } catch {
        responsePreview = { statusText: response.statusText };
      }

      return res.json({
        success: response.ok || response.status < 500,
        statusCode: response.status,
        statusText: response.statusText,
        latencyMs,
        url: targetUrl,
        message: response.ok 
          ? `Connection verified successfully (${latencyMs}ms)!`
          : `Connected to host with HTTP status ${response.status} (${response.statusText}).`,
        responseSample: responsePreview
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      return res.json({
        success: false,
        error: fetchErr.name === "AbortError" ? "Connection timed out after 6000ms" : fetchErr.message,
        latencyMs,
        url: targetUrl,
        message: `Could not reach ${targetUrl}. Ensure the host is reachable or use the built-in simulator.`
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/integrations/logs
integrationsRouter.get("/integrations/logs", async (req: any, res: any) => {
  try {
    const logs = await db.prepare(`
      SELECT * FROM integration_sync_logs 
      ORDER BY createdAt DESC 
      LIMIT 100
    `).all();
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/integrations/logs
integrationsRouter.delete("/integrations/logs", async (req: any, res: any) => {
  try {
    await db.prepare("DELETE FROM integration_sync_logs").run();
    res.json({ success: true, message: "Sync logs cleared successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 2. Core Sync Logic (Employees, DTR, Schedules)
// -------------------------------------------------------------

// Helper to fetch data from School API or use provided payload
async function fetchFromSchoolApi(endpointKey: string, defaultEndpoint: string, overridePayload?: any) {
  if (overridePayload && Array.isArray(overridePayload) && overridePayload.length > 0) {
    return { data: overridePayload, source: "direct_payload" };
  }

  const baseUrl = await getSetting("school_api_base_url", process.env.SCHOOL_API_BASE_URL || "");
  const endpoint = await getSetting(endpointKey, defaultEndpoint);
  const apiKey = await getSetting("school_api_key", process.env.SCHOOL_API_KEY || "");
  const bearerToken = await getSetting("school_api_bearer_token", process.env.SCHOOL_API_BEARER_TOKEN || "");

  if (!baseUrl) {
    throw new Error("School API Base URL is not configured. Please set it in School API Settings or provide payload directly.");
  }

  const fullUrl = `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "User-Agent": "SLSU-Payroll-Sync/1.0"
  };
  if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
  if (apiKey) headers["X-API-Key"] = apiKey;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const res = await fetch(fullUrl, { method: "GET", headers, signal: controller.signal });
  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new Error(`School API returned HTTP ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  const data = Array.isArray(json) ? json : (json.data || json.employees || json.records || json.schedules || []);
  return { data, source: fullUrl };
}

// POST /api/integrations/sync/employees
integrationsRouter.post("/integrations/sync/employees", async (req: any, res: any) => {
  const startTime = Date.now();
  let receivedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  try {
    const { employees: directList, mode = "merge" } = req.body;
    let listToSync: any[] = [];
    let dataSource = "";

    if (directList && Array.isArray(directList)) {
      listToSync = directList;
      dataSource = "Manual / Payload Sync";
    } else {
      const fetched = await fetchFromSchoolApi("school_endpoint_employees", "/api/v1/employees");
      listToSync = fetched.data;
      dataSource = fetched.source;
    }

    receivedCount = listToSync.length;

    for (const item of listToSync) {
      try {
        const empNo = String(item.employeeId || item.employeeNo || item.id || "").trim();
        if (!empNo) {
          failedCount++;
          continue;
        }

        const email = (item.email || `${empNo.toLowerCase().replace(/[^a-z0-9]/g, "")}@slsu.edu.ph`).trim();
        const firstName = item.firstName || item.first_name || item.name?.split(" ")[0] || "Faculty/Staff";
        const lastName = item.lastName || item.last_name || item.name?.split(" ").slice(1).join(" ") || empNo;
        const category = item.category || item.employmentCategory || item.employmentType || "FACULTY";
        const basicSalary = parseFloat(item.basicSalary || item.salary || item.rate || 0) || 0;
        const salaryType = item.salaryType || (category.toLowerCase().includes("job order") || category.toLowerCase().includes("visiting") ? "daily" : "monthly");
        const status = item.status || "active";
        const campus = item.campus || item.campusName || "Hinunangan Campus";
        const position = item.position || item.designation || item.jobTitle || "Instructor I";
        const phoneNumber = item.phoneNumber || item.contactNumber || item.phone || "09171234567";
        const gender = item.gender || "MALE";
        const hireDate = item.hireDate || item.dateHired || new Date().toISOString().split("T")[0];

        // Government IDs & Deductions flags
        const hasSss = item.hasSss !== undefined ? (item.hasSss ? 1 : 0) : (item.sssNo ? 1 : 0);
        const hasPhilhealth = item.hasPhilhealth !== undefined ? (item.hasPhilhealth ? 1 : 0) : (item.philhealthNo ? 1 : 1);
        const hasPagibig = item.hasPagibig !== undefined ? (item.hasPagibig ? 1 : 0) : (item.pagibigNo ? 1 : 1);
        const bpno = item.bpno || item.gsisBpNo || "";

        // Check if employee exists
        const existing = await findEmployee(empNo) || (email ? await findEmployee(email) : null);

        if (existing) {
          // Update employee
          await db.prepare(`
            UPDATE employees SET
              employeeId = ?, firstName = ?, lastName = ?, email = ?, category = ?,
              basicSalary = ?, salaryType = ?, status = ?, phoneNumber = ?, hireDate = ?,
              hasSss = ?, hasPhilhealth = ?, hasPagibig = ?, bpno = ?, position = ?,
              gender = ?, campus = ?
            WHERE id = ?
          `).run(
            empNo, firstName, lastName, email, category, basicSalary, salaryType,
            status, phoneNumber, hireDate, hasSss, hasPhilhealth, hasPagibig,
            bpno, position, gender, campus, existing.id
          );

          // Ensure User record is in sync
          await db.prepare(`
            INSERT OR REPLACE INTO users (id, email, password, displayName, role, campus)
            VALUES (?, ?, COALESCE((SELECT password FROM users WHERE id = ?), 'employee123'), ?, 'employee', ?)
          `).run(existing.id, email.toLowerCase(), existing.id, `${firstName} ${lastName}`, campus);

          updatedCount++;
        } else {
          // Insert new employee
          const newId = `emp-${empNo.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
          await db.prepare(`
            INSERT INTO employees (
              id, employeeId, firstName, lastName, email, password, category,
              basicSalary, salaryType, status, phoneNumber, hireDate, hasSss,
              hasPhilhealth, hasPagibig, bpno, position, gender, campus
            ) VALUES (?, ?, ?, ?, ?, 'employee123', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newId, empNo, firstName, lastName, email, category, basicSalary, salaryType,
            status, phoneNumber, hireDate, hasSss, hasPhilhealth, hasPagibig,
            bpno, position, gender, campus
          );

          // Create matching User login
          await db.prepare(`
            INSERT OR REPLACE INTO users (id, email, password, displayName, role, campus)
            VALUES (?, ?, 'employee123', ?, 'employee', ?)
          `).run(newId, email.toLowerCase(), `${firstName} ${lastName}`, campus);

          // If visiting instructor, insert record into visiting_instructors
          if (category.toLowerCase().includes("visiting")) {
            const hourlyRate = parseFloat(item.hourlyRate || 350.00);
            await db.prepare(`
              INSERT OR REPLACE INTO visiting_instructors (id, employeeId, hourlyRate, designation, maxHoursPerWeek)
              VALUES (?, ?, ?, ?, 18.0)
            `).run(`vi-${newId}`, newId, hourlyRate, position);
          }

          createdCount++;
        }
      } catch (rowErr: any) {
        failedCount++;
        errors.push(`Emp ${item.employeeId || 'unknown'}: ${rowErr.message}`);
      }
    }

    const durationMs = Date.now() - startTime;
    const msg = `Synced ${receivedCount} employees from ${dataSource} (${createdCount} added, ${updatedCount} updated, ${failedCount} errors)`;

    await logSyncResult(
      "employees",
      failedCount === receivedCount && receivedCount > 0 ? "failed" : "success",
      receivedCount,
      createdCount,
      updatedCount,
      failedCount,
      msg,
      { dataSource, errors: errors.slice(0, 5) },
      req.headers["x-user-email"] || "admin",
      durationMs
    );

    broadcastRealtime("employees_synced", { createdCount, updatedCount, total: receivedCount });

    res.json({
      success: true,
      message: msg,
      stats: {
        totalReceived: receivedCount,
        created: createdCount,
        updated: updatedCount,
        failed: failedCount,
        durationMs
      }
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await logSyncResult("employees", "failed", receivedCount, createdCount, updatedCount, receivedCount || 1, err.message, {}, "admin", durationMs);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/integrations/sync/dtr
integrationsRouter.post("/integrations/sync/dtr", async (req: any, res: any) => {
  const startTime = Date.now();
  let receivedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  try {
    const { records: directList, startDate, endDate } = req.body;
    let listToSync: any[] = [];
    let dataSource = "";

    if (directList && Array.isArray(directList)) {
      listToSync = directList;
      dataSource = "Direct Attendance Logs";
    } else {
      const fetched = await fetchFromSchoolApi("school_endpoint_dtr", "/api/v1/dtr");
      listToSync = fetched.data;
      dataSource = fetched.source;
    }

    receivedCount = listToSync.length;

    for (const item of listToSync) {
      try {
        const empIdOrNo = item.employeeId || item.employeeNo || item.id;
        const emp = await findEmployee(empIdOrNo);
        if (!emp) {
          failedCount++;
          errors.push(`Employee not found: ${empIdOrNo}`);
          continue;
        }

        const date = item.date || item.attendanceDate || new Date().toISOString().split("T")[0];
        const timeIn = item.timeIn || item.time_in || item.amIn || "";
        const timeOut = item.timeOut || item.time_out || item.pmOut || "";
        const amIn = item.amIn || item.am_in || "";
        const amOut = item.amOut || item.am_out || "";
        const pmIn = item.pmIn || item.pm_in || "";
        const pmOut = item.pmOut || item.pm_out || "";

        // Calculate hours and lates
        const metrics = calculateDtrMetrics(timeIn, timeOut, amIn, amOut, pmIn, pmOut);
        const hoursWorked = item.hoursWorked !== undefined ? Number(item.hoursWorked) : metrics.hoursWorked;
        const overtimeHours = item.overtimeHours !== undefined ? Number(item.overtimeHours) : metrics.overtimeHours;
        const lateMinutes = item.lateMinutes !== undefined ? Number(item.lateMinutes) : metrics.lateMinutes;
        const undertimeMinutes = item.undertimeMinutes !== undefined ? Number(item.undertimeMinutes) : metrics.undertimeMinutes;
        const status = item.status || (hoursWorked > 0 ? "regular" : "absent");
        const notes = item.notes || `Synced from School Biometrics (${dataSource})`;

        // Check if DTR record exists for this employee + date
        const existing = await db.prepare(`
          SELECT id FROM dtr_records WHERE employeeId = ? AND date = ?
        `).get(emp.id, date) as any;

        if (existing) {
          await db.prepare(`
            UPDATE dtr_records SET
              timeIn = COALESCE(NULLIF(?, ''), timeIn),
              timeOut = COALESCE(NULLIF(?, ''), timeOut),
              amIn = COALESCE(NULLIF(?, ''), amIn),
              amOut = COALESCE(NULLIF(?, ''), amOut),
              pmIn = COALESCE(NULLIF(?, ''), pmIn),
              pmOut = COALESCE(NULLIF(?, ''), pmOut),
              hoursWorked = ?,
              overtimeHours = ?,
              lateMinutes = ?,
              undertimeMinutes = ?,
              status = ?,
              notes = ?
            WHERE id = ?
          `).run(
            timeIn, timeOut, amIn, amOut, pmIn, pmOut,
            hoursWorked, overtimeHours, lateMinutes, undertimeMinutes,
            status, notes, existing.id
          );
          updatedCount++;
        } else {
          const recId = `dtr-${emp.id}-${date}`;
          await db.prepare(`
            INSERT INTO dtr_records (
              id, employeeId, date, timeIn, timeOut, amIn, amOut, pmIn, pmOut,
              hoursWorked, overtimeHours, lateMinutes, undertimeMinutes, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            recId, emp.id, date, timeIn, timeOut, amIn, amOut, pmIn, pmOut,
            hoursWorked, overtimeHours, lateMinutes, undertimeMinutes, status, notes
          );
          createdCount++;
        }

        // Also add punch log if provided
        if (timeIn) {
          const punchId = `punch-${emp.id}-${date}-in`;
          await db.prepare(`
            INSERT OR IGNORE INTO dtr_logs (id, employeeId, timestamp, type, source, notes)
            VALUES (?, ?, ?, 'in', 'school_api', 'School Biometrics Sync')
          `).run(punchId, emp.id, `${date} ${timeIn.length === 5 ? timeIn + ':00' : timeIn}`);
        }
        if (timeOut) {
          const punchId = `punch-${emp.id}-${date}-out`;
          await db.prepare(`
            INSERT OR IGNORE INTO dtr_logs (id, employeeId, timestamp, type, source, notes)
            VALUES (?, ?, ?, 'out', 'school_api', 'School Biometrics Sync')
          `).run(punchId, emp.id, `${date} ${timeOut.length === 5 ? timeOut + ':00' : timeOut}`);
        }
      } catch (rowErr: any) {
        failedCount++;
        errors.push(rowErr.message);
      }
    }

    const durationMs = Date.now() - startTime;
    const msg = `Synced ${receivedCount} attendance records from ${dataSource} (${createdCount} created, ${updatedCount} updated, ${failedCount} errors)`;

    await logSyncResult(
      "dtr",
      failedCount === receivedCount && receivedCount > 0 ? "failed" : "success",
      receivedCount,
      createdCount,
      updatedCount,
      failedCount,
      msg,
      { dataSource, errors: errors.slice(0, 5) },
      req.headers["x-user-email"] || "admin",
      durationMs
    );

    broadcastRealtime("dtr_synced", { createdCount, updatedCount, total: receivedCount });

    res.json({
      success: true,
      message: msg,
      stats: {
        totalReceived: receivedCount,
        created: createdCount,
        updated: updatedCount,
        failed: failedCount,
        durationMs
      }
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await logSyncResult("dtr", "failed", receivedCount, createdCount, updatedCount, receivedCount || 1, err.message, {}, "admin", durationMs);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/integrations/sync/schedules
integrationsRouter.post("/integrations/sync/schedules", async (req: any, res: any) => {
  const startTime = Date.now();
  let receivedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  try {
    const { schedules: directList } = req.body;
    let listToSync: any[] = [];
    let dataSource = "";

    if (directList && Array.isArray(directList)) {
      listToSync = directList;
      dataSource = "Direct Schedule Payload";
    } else {
      const fetched = await fetchFromSchoolApi("school_endpoint_schedules", "/api/v1/schedules");
      listToSync = fetched.data;
      dataSource = fetched.source;
    }

    receivedCount = listToSync.length;

    for (const item of listToSync) {
      try {
        const empIdOrNo = item.employeeId || item.instructorId || item.employeeNo;
        const emp = await findEmployee(empIdOrNo);
        if (!emp) {
          failedCount++;
          errors.push(`Instructor not found: ${empIdOrNo}`);
          continue;
        }

        const dayOfWeek = item.dayOfWeek || item.day || "Monday";
        const startTimeStr = item.startTime || item.timeStart || "08:00";
        const endTimeStr = item.endTime || item.timeEnd || "11:00";
        const subject = item.subject || item.subjectCode || item.course || "General Class";
        const room = item.room || item.roomNo || item.laboratory || "Room 101";
        const specificDate = item.specificDate || "";
        const semester = item.semester || "1st Semester";
        const academicYear = item.academicYear || "2025-2026";
        const section = item.section || "BSIT 1-A";
        const hoursPerWeek = parseFloat(item.hoursPerWeek || item.units || 3);

        const schedId = `sched-${emp.id}-${dayOfWeek}-${startTimeStr.replace(":", "")}`;

        // Upsert into schedules
        await db.prepare(`
          INSERT OR REPLACE INTO schedules (
            id, employeeId, dayOfWeek, startTime, endTime, timeIn, timeOut,
            subject, room, specificDate, effectiveFrom, effectiveTo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          schedId, emp.id, dayOfWeek, startTimeStr, endTimeStr, startTimeStr, endTimeStr,
          subject, room, specificDate, item.effectiveFrom || "", item.effectiveTo || ""
        );

        // Also add or update in teaching_loads if subject exists or is faculty
        if (emp.category?.toLowerCase().includes("faculty") || emp.category?.toLowerCase().includes("visiting")) {
          // Check/create subject
          const subjRow = await db.prepare("SELECT id FROM subjects WHERE code = ?").get(subject) as any;
          const subjectId = subjRow ? subjRow.id : `subj-${subject.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
          if (!subjRow) {
            await db.prepare(`
              INSERT OR IGNORE INTO subjects (id, code, title, units, description)
              VALUES (?, ?, ?, ?, 'Imported from School SIS')
            `).run(subjectId, subject, subject, Math.min(hoursPerWeek, 5));
          }

          const loadId = `tl-${emp.id}-${subjectId}-${section.replace(/[^a-z0-9]/gi, "")}`;
          await db.prepare(`
            INSERT OR REPLACE INTO teaching_loads (
              id, employeeId, subjectId, section, days, startTime, endTime, room,
              hoursPerWeek, semester, academicYear
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            loadId, emp.id, subjectId, section, dayOfWeek, startTimeStr, endTimeStr,
            room, hoursPerWeek, semester, academicYear
          );
        }

        createdCount++;
      } catch (rowErr: any) {
        failedCount++;
        errors.push(rowErr.message);
      }
    }

    const durationMs = Date.now() - startTime;
    const msg = `Synced ${receivedCount} class schedules & teaching loads from ${dataSource} (${createdCount} records upserted, ${failedCount} errors)`;

    await logSyncResult(
      "schedules",
      failedCount === receivedCount && receivedCount > 0 ? "failed" : "success",
      receivedCount,
      createdCount,
      updatedCount,
      failedCount,
      msg,
      { dataSource, errors: errors.slice(0, 5) },
      req.headers["x-user-email"] || "admin",
      durationMs
    );

    broadcastRealtime("schedules_synced", { count: createdCount });

    res.json({
      success: true,
      message: msg,
      stats: {
        totalReceived: receivedCount,
        upserted: createdCount,
        failed: failedCount,
        durationMs
      }
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await logSyncResult("schedules", "failed", receivedCount, createdCount, updatedCount, receivedCount || 1, err.message, {}, "admin", durationMs);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/integrations/sync/all
integrationsRouter.post("/integrations/sync/all", async (req: any, res: any) => {
  const startTime = Date.now();
  const results: any = {};

  try {
    // 1. Sync Employees
    try {
      const empRes = await fetch(`http://localhost:3000/api/integrations/sync/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      results.employees = await empRes.json();
    } catch (e: any) {
      results.employees = { success: false, error: e.message };
    }

    // 2. Sync DTR
    try {
      const dtrRes = await fetch(`http://localhost:3000/api/integrations/sync/dtr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      results.dtr = await dtrRes.json();
    } catch (e: any) {
      results.dtr = { success: false, error: e.message };
    }

    // 3. Sync Schedules
    try {
      const schedRes = await fetch(`http://localhost:3000/api/integrations/sync/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      results.schedules = await schedRes.json();
    } catch (e: any) {
      results.schedules = { success: false, error: e.message };
    }

    const durationMs = Date.now() - startTime;
    res.json({
      success: true,
      message: "Comprehensive School System Synchronization Completed",
      durationMs,
      results
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 3. Inbound Webhooks (For Biometrics Turnstiles & School SIS Push)
// -------------------------------------------------------------

// POST /api/integrations/webhook/dtr-punch
integrationsRouter.post("/integrations/webhook/dtr-punch", async (req: any, res: any) => {
  try {
    const { employeeId, employeeNo, email, timestamp, type = "in", terminalId, source = "biometric-turnstile", notes } = req.body;

    const emp = await findEmployee(employeeId || employeeNo || email);
    if (!emp) {
      return res.status(404).json({ success: false, error: `Employee not found (${employeeId || employeeNo || email})` });
    }

    const punchTime = timestamp ? new Date(timestamp) : new Date();
    const dateStr = punchTime.toISOString().split("T")[0];
    const timeStr = punchTime.toTimeString().split(" ")[0].substring(0, 5); // HH:mm
    const logId = `punch-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    // 1. Insert punch log
    await db.prepare(`
      INSERT INTO dtr_logs (id, employeeId, timestamp, type, source, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(logId, emp.id, punchTime.toISOString(), type.toLowerCase(), source, notes || `Biometric Terminal ${terminalId || 'Main Entrance'}`);

    // 2. Update or create today's DTR record
    const existing = await db.prepare(`
      SELECT * FROM dtr_records WHERE employeeId = ? AND date = ?
    `).get(emp.id, dateStr) as any;

    const isPunchIn = type.toLowerCase().includes("in");
    let updatedTimeIn = existing?.timeIn || (isPunchIn ? timeStr : null);
    let updatedTimeOut = existing?.timeOut || (!isPunchIn ? timeStr : null);

    if (isPunchIn && (!existing?.timeIn || timeStr < existing.timeIn)) {
      updatedTimeIn = timeStr;
    }
    if (!isPunchIn && (!existing?.timeOut || timeStr > existing.timeOut)) {
      updatedTimeOut = timeStr;
    }

    const metrics = calculateDtrMetrics(updatedTimeIn || "", updatedTimeOut || "", existing?.amIn, existing?.amOut, existing?.pmIn, existing?.pmOut);

    if (existing) {
      await db.prepare(`
        UPDATE dtr_records SET
          timeIn = COALESCE(?, timeIn),
          timeOut = COALESCE(?, timeOut),
          hoursWorked = ?,
          overtimeHours = ?,
          lateMinutes = ?,
          undertimeMinutes = ?,
          status = 'regular'
        WHERE id = ?
      `).run(updatedTimeIn, updatedTimeOut, metrics.hoursWorked, metrics.overtimeHours, metrics.lateMinutes, metrics.undertimeMinutes, existing.id);
    } else {
      const recId = `dtr-${emp.id}-${dateStr}`;
      await db.prepare(`
        INSERT INTO dtr_records (
          id, employeeId, date, timeIn, timeOut, hoursWorked, overtimeHours,
          lateMinutes, undertimeMinutes, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'regular', ?)
      `).run(
        recId, emp.id, dateStr, updatedTimeIn, updatedTimeOut, metrics.hoursWorked,
        metrics.overtimeHours, metrics.lateMinutes, metrics.undertimeMinutes, `Turnstile Punch (${source})`
      );
    }

    broadcastRealtime("dtr_punch", {
      employeeId: emp.id,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      date: dateStr,
      time: timeStr,
      type
    });

    res.json({
      success: true,
      message: `Punch recorded for ${emp.firstName} ${emp.lastName} at ${timeStr}`,
      punch: {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        date: dateStr,
        time: timeStr,
        type
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/integrations/webhook/employee-update
integrationsRouter.post("/integrations/webhook/employee-update", async (req: any, res: any) => {
  try {
    const employeeData = req.body;
    const empNo = employeeData.employeeId || employeeData.employeeNo || employeeData.id;
    if (!empNo) {
      return res.status(400).json({ success: false, error: "employeeId is required" });
    }

    const emp = await findEmployee(empNo);
    if (!emp) {
      return res.status(404).json({ success: false, error: `Employee ${empNo} not found` });
    }

    // Update salary or details if supplied
    if (employeeData.basicSalary !== undefined || employeeData.salary !== undefined) {
      const newSalary = parseFloat(employeeData.basicSalary || employeeData.salary || 0);
      await db.prepare("UPDATE employees SET basicSalary = ? WHERE id = ?").run(newSalary, emp.id);
    }
    if (employeeData.position) {
      await db.prepare("UPDATE employees SET position = ? WHERE id = ?").run(employeeData.position, emp.id);
    }
    if (employeeData.status) {
      await db.prepare("UPDATE employees SET status = ? WHERE id = ?").run(employeeData.status, emp.id);
    }

    broadcastRealtime("employee_updated", { employeeId: emp.id });
    res.json({ success: true, message: `Employee ${emp.id} updated via webhook` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 4. Built-in Mock School API Simulator Endpoints
// (Enables instant testing without needing real external school servers)
// -------------------------------------------------------------

// GET /api/integrations/mock/school-api/employees
integrationsRouter.get("/integrations/mock/school-api/employees", (req: any, res: any) => {
  res.json({
    status: "success",
    timestamp: new Date().toISOString(),
    source: "SLSU Central HRIS Simulation Gateway",
    total: 5,
    data: [
      {
        employeeId: "SLSU-2026-001",
        firstName: "Maria",
        lastName: "Santos",
        email: "maria.santos@slsu.edu.ph",
        category: "FACULTY",
        position: "Associate Professor II",
        basicSalary: 45000.00,
        salaryType: "monthly",
        campus: "Hinunangan Campus",
        phoneNumber: "09171112233",
        gender: "FEMALE",
        hireDate: "2021-06-15"
      },
      {
        employeeId: "SLSU-2026-002",
        firstName: "Juan",
        lastName: "Dela Cruz",
        email: "juan.delacruz@slsu.edu.ph",
        category: "STAFF",
        position: "Administrative Officer IV",
        basicSalary: 32000.00,
        salaryType: "monthly",
        campus: "Hinunangan Campus",
        phoneNumber: "09182223344",
        gender: "MALE",
        hireDate: "2022-01-10"
      },
      {
        employeeId: "SLSU-2026-003",
        firstName: "Elena",
        lastName: "Reyes",
        email: "elena.reyes@slsu.edu.ph",
        category: "Visiting Instructor",
        position: "Visiting Lecturer",
        basicSalary: 18000.00,
        hourlyRate: 380.00,
        salaryType: "daily",
        campus: "Hinunangan Campus",
        phoneNumber: "09193334455",
        gender: "FEMALE",
        hireDate: "2024-08-01"
      },
      {
        employeeId: "SLSU-2026-004",
        firstName: "Roberto",
        lastName: "Gonzales",
        email: "roberto.gonzales@slsu.edu.ph",
        category: "Job Order",
        position: "IT Support Technician",
        basicSalary: 14500.00,
        salaryType: "daily",
        campus: "Hinunangan Campus",
        phoneNumber: "09204445566",
        gender: "MALE",
        hireDate: "2023-03-20"
      },
      {
        employeeId: "SLSU-2026-005",
        firstName: "Anna",
        lastName: "Lim",
        email: "anna.lim@slsu.edu.ph",
        category: "FACULTY",
        position: "Assistant Professor I",
        basicSalary: 38000.00,
        salaryType: "monthly",
        campus: "Sogod (Main) Campus",
        phoneNumber: "09215556677",
        gender: "FEMALE",
        hireDate: "2020-09-01"
      }
    ]
  });
});

// GET /api/integrations/mock/school-api/dtr
integrationsRouter.get("/integrations/mock/school-api/dtr", (req: any, res: any) => {
  const today = new Date().toISOString().split("T")[0];
  res.json({
    status: "success",
    timestamp: new Date().toISOString(),
    source: "SLSU Biometrics Turnstile Gateway",
    total: 4,
    data: [
      {
        employeeId: "emp-101",
        employeeNo: "SLSU-2026-001",
        date: today,
        amIn: "07:55",
        amOut: "12:02",
        pmIn: "12:58",
        pmOut: "17:05",
        timeIn: "07:55",
        timeOut: "17:05",
        hoursWorked: 8.0,
        overtimeHours: 0.0,
        lateMinutes: 0,
        undertimeMinutes: 0,
        status: "regular"
      },
      {
        employeeId: "emp-102",
        employeeNo: "SLSU-2026-002",
        date: today,
        amIn: "08:12",
        amOut: "12:00",
        pmIn: "13:00",
        pmOut: "17:00",
        timeIn: "08:12",
        timeOut: "17:00",
        hoursWorked: 7.8,
        overtimeHours: 0.0,
        lateMinutes: 12,
        undertimeMinutes: 0,
        status: "regular"
      },
      {
        employeeId: "emp-103",
        employeeNo: "SLSU-2026-003",
        date: today,
        timeIn: "08:00",
        timeOut: "11:30",
        hoursWorked: 3.5,
        overtimeHours: 0.0,
        lateMinutes: 0,
        undertimeMinutes: 0,
        status: "regular"
      },
      {
        employeeId: "emp-104",
        employeeNo: "SLSU-2026-004",
        date: today,
        amIn: "08:00",
        amOut: "12:00",
        pmIn: "13:00",
        pmOut: "18:00",
        timeIn: "08:00",
        timeOut: "18:00",
        hoursWorked: 8.0,
        overtimeHours: 1.0,
        lateMinutes: 0,
        undertimeMinutes: 0,
        status: "regular"
      }
    ]
  });
});

// GET /api/integrations/mock/school-api/schedules
integrationsRouter.get("/integrations/mock/school-api/schedules", (req: any, res: any) => {
  res.json({
    status: "success",
    timestamp: new Date().toISOString(),
    source: "SLSU SIS Class Scheduling Database",
    total: 4,
    data: [
      {
        employeeId: "emp-101",
        employeeNo: "SLSU-2026-001",
        subject: "IT 101 - Intro to Computing",
        subjectCode: "IT 101",
        section: "BSIT 1-A",
        dayOfWeek: "Monday",
        startTime: "08:00",
        endTime: "10:00",
        room: "CCS Computer Lab 1",
        hoursPerWeek: 3.0,
        semester: "1st Semester",
        academicYear: "2025-2026"
      },
      {
        employeeId: "emp-101",
        employeeNo: "SLSU-2026-001",
        subject: "IT 102 - Computer Programming 1",
        subjectCode: "IT 102",
        section: "BSIT 1-B",
        dayOfWeek: "Wednesday",
        startTime: "10:00",
        endTime: "12:00",
        room: "CCS Computer Lab 2",
        hoursPerWeek: 3.0,
        semester: "1st Semester",
        academicYear: "2025-2026"
      },
      {
        employeeId: "emp-103",
        employeeNo: "SLSU-2026-003",
        subject: "IT 201 - Data Structures & Algorithms",
        subjectCode: "IT 201",
        section: "BSIT 2-A",
        dayOfWeek: "Tuesday",
        startTime: "09:00",
        endTime: "12:00",
        room: "CCS Lecture Hall",
        hoursPerWeek: 3.0,
        semester: "1st Semester",
        academicYear: "2025-2026"
      },
      {
        employeeId: "emp-103",
        employeeNo: "SLSU-2026-003",
        subject: "IT 301 - Web Development",
        subjectCode: "IT 301",
        section: "BSIT 3-A",
        dayOfWeek: "Thursday",
        startTime: "13:00",
        endTime: "16:00",
        room: "CCS Computer Lab 3",
        hoursPerWeek: 3.0,
        semester: "1st Semester",
        academicYear: "2025-2026"
      }
    ]
  });
});
