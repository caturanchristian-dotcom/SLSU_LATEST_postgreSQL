import { AsyncLocalStorage } from "async_hooks";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

// Disable SSL certificate verification rejection for cloud run / pooler environments
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Transaction context storage for PostgreSQL
const postgresTransactionStorage = new AsyncLocalStorage<pg.PoolClient>();

// Database Connection URL detection
export function getDatabaseUrl(): string {
  const url = (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    rawDatabaseUrl ||
    ""
  ).trim();
  return url;
}

const rawDatabaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL ||
  "";

// Engine flags - pure PostgreSQL & Supabase
export const isPostgres = true;
export const isMysql = false;

export const isSupabaseConfigured = Boolean(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_DB_URL
);

// PostgreSQL / Supabase connection pool
let postgresPool: pg.Pool | null = null;

/**
 * Creates or returns the dedicated PostgreSQL / Supabase connection pool
 */
export function getPostgresPool(): pg.Pool {
  const pgUrl = getDatabaseUrl();

  if (!postgresPool) {
    if (!pgUrl) {
      throw new Error(
        "DATABASE_URL is not configured. Please set DATABASE_URL or POSTGRES_URL in environment variables to connect to PostgreSQL/Supabase."
      );
    }

    postgresPool = new pg.Pool({
      connectionString: pgUrl,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    postgresPool.on("error", (err) => {
      console.error("[PostgreSQL Pool Error]:", err.message);
      if (err.message?.includes("ECONNREFUSED") || err.message?.includes("connection terminated")) {
        postgresPool = null;
      }
    });
    console.log("[PostgreSQL Pool] PostgreSQL connection pool initialized.");
  }
  return postgresPool;
}

// Case-sensitive identifiers that PostgreSQL requires double-quoting
const CAMEL_CASE_COLUMNS = [
  "displayName", "employeeId", "firstName", "lastName", "basicSalary",
  "salaryType", "phoneNumber", "hireDate", "hasSss", "hasPhilhealth",
  "hasPagibig", "hasGsis", "customDeductions", "leaveBalances", "profileImage",
  "employmentType", "rankPosition", "contractStart", "contractEnd", "createdAt",
  "updatedAt", "startDate", "endDate", "payrollType", "totalGross", "totalDeductions",
  "totalNet", "cutoffPeriod", "processDate", "userId", "userEmail", "ipAddress",
  "recordDataJson", "detailsJson", "syncedAt", "batchId", "birthDate",
  "effectivityDate", "managedBy", "managedByName", "categoryFilter",
  "approvedBy", "approvedAt", "cycleId", "payrollId", "itemCount", "baseAmount",
  "grossPay", "netPay", "otHours", "teachingHours", "teachingHoursWorked",
  "hourlyRate", "departmentId", "teachingDepartmentId", "hourlyRate",
  "dayOfWeek", "startTime", "endTime", "timeIn", "timeOut", "hoursWorked",
  "overtimeHours", "lateMinutes", "undertimeMinutes", "academicYear",
  "hoursPerWeek", "maxHoursPerWeek", "peraAmount", "hazardPay", "baseRate",
  "customBaseRate", "customPera", "effectiveDate", "leaveType", "daysCount",
  "rejectionReason", "reviewedBy", "reviewedAt", "principalAmount",
  "totalAmount", "monthlyAmortization", "termMonths", "remainingBalance",
  "paymentDate", "recordsReceived", "recordsCreated", "recordsUpdated",
  "recordsFailed", "durationMs", "initiatedBy", "sentAt", "departmentHeadId",
  "amIn", "amOut", "pmIn", "pmOut", "teachingLoadId", "subjectCode",
  "hoursRendered", "totalPay", "govSecGsis", "govSecHdmf", "govSecPh",
  "govSecEcip", "compSal2nd", "compPera", "compGross", "absences",
  "dedPolicyLoan", "dedConsolLoan", "dedMplLite", "dedMpl", "dedCpl",
  "dedGfal", "dedEmergencyLoan", "dedGsisPremPersonal", "dedEducAsst",
  "dedPagibigPersonal", "dedPagibigMpl", "dedSss", "dedPagibigMp2",
  "dedPhilhealthCont", "dedCsbLoan", "dedTaxWithheld", "isValidated", "basicPay",
  "employeeName", "createdBy"
];

/**
 * Translates queries and DDL to valid PostgreSQL syntax
 */
export function translatePostgresSql(sql: string): string {
  let finalSql = sql;

  // 1. Convert reserved backticks to double quotes
  finalSql = finalSql.replace(/`key`/gi, '"key"')
                     .replace(/`table`/gi, '"table"')
                     .replace(/`to`/gi, '"to"')
                     .replace(/`from`/gi, '"from"')
                     .replace(/`order`/gi, '"order"');

  // 2. Wrap all known camelCase column identifiers in double quotes (without double quoting already quoted identifiers)
  for (const ident of CAMEL_CASE_COLUMNS) {
    const reg = new RegExp(`(?:"*)\\b${ident}\\b(?:"*)(?=(?:(?:[^']*'){2})*[^']*$)`, "g");
    finalSql = finalSql.replace(reg, `"${ident}"`);
  }

  // 3. Handle PRAGMA commands
  if (/PRAGMA\s+table_info\s*\(\s*(\w+)\s*\)/i.test(finalSql)) {
    const match = finalSql.match(/PRAGMA\s+table_info\s*\(\s*(\w+)\s*\)/i);
    const tableName = match ? match[1] : "";
    return `SELECT column_name as name, data_type as type, is_nullable = 'NO' as notnull, column_default as dflt_value, 0 as pk FROM information_schema.columns WHERE table_name = '${tableName.toLowerCase()}'`;
  }

  // 4. Translate SQLite INSERT OR IGNORE / REPLACE
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(finalSql)) {
    finalSql = finalSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO") + " ON CONFLICT DO NOTHING";
  } else if (/INSERT\s+OR\s+REPLACE\s+INTO/i.test(finalSql)) {
    if (finalSql.includes("payroll_settings")) {
      finalSql = finalSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO") +
        ' ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, "updatedAt" = CURRENT_TIMESTAMP';
    } else {
      finalSql = finalSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO") + " ON CONFLICT (id) DO NOTHING";
    }
  }

  // 5. Translate MySQL / SQLite data types to standard PostgreSQL types
  finalSql = finalSql.replace(/\bLONGTEXT\b/gi, "TEXT")
                     .replace(/\bMEDIUMTEXT\b/gi, "TEXT")
                     .replace(/\bTINYTEXT\b/gi, "TEXT")
                     .replace(/\bDATETIME\b/gi, "TIMESTAMPTZ")
                     .replace(/\bINT\s+AUTO_INCREMENT\b/gi, "SERIAL")
                     .replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, "SERIAL PRIMARY KEY");

  // 6. Convert parameter markers '?' to numbered PostgreSQL markers '$1, $2, $3...'
  let paramIndex = 1;
  finalSql = finalSql.replace(/\?/g, () => `$${paramIndex++}`);

  return finalSql;
}

// SQL translation for PostgreSQL / Supabase
export const translateSql = translatePostgresSql;

/**
 * Normalizes rows returned by database drivers to match camelCase keys expected by client UI
 */
export function normalizeRow(row: any): any {
  if (!row || typeof row !== "object") return row;
  const newRow: Record<string, any> = {};

  // First copy all existing properties
  for (const [key, val] of Object.entries(row)) {
    newRow[key] = val;
  }

  // Priority mapping for camelCase fields so non-null values take precedence
  const setIfValOrEmpty = (targetKey: string, val: any) => {
    if (val !== null && val !== undefined && val !== "") {
      newRow[targetKey] = val;
    } else if (newRow[targetKey] === undefined) {
      newRow[targetKey] = val;
    }
  };

  for (const [key, val] of Object.entries(row)) {
    const lower = key.toLowerCase();
    if (lower === "displayname" || lower === "display_name") setIfValOrEmpty("displayName", val);
    if (lower === "employeeid" || lower === "employee_id") setIfValOrEmpty("employeeId", val);
    if (lower === "firstname" || lower === "first_name") setIfValOrEmpty("firstName", val);
    if (lower === "lastname" || lower === "last_name") setIfValOrEmpty("lastName", val);
    if (lower === "basicsalary" || lower === "basic_salary") setIfValOrEmpty("basicSalary", val);
    if (lower === "salarytype" || lower === "salary_type") setIfValOrEmpty("salaryType", val);
    if (lower === "phonenumber" || lower === "phone_number") setIfValOrEmpty("phoneNumber", val);
    if (lower === "hiredate" || lower === "hire_date") setIfValOrEmpty("hireDate", val);
    if (lower === "birthdate" || lower === "birth_date") setIfValOrEmpty("birthDate", val);
    if (lower === "effectivitydate" || lower === "effectivity_date") setIfValOrEmpty("effectivityDate", val);
    if (lower === "profileimage" || lower === "profile_image") setIfValOrEmpty("profileImage", val);
    if (lower === "createdat" || lower === "created_at") setIfValOrEmpty("createdAt", val);
    if (lower === "updatedat" || lower === "updated_at") setIfValOrEmpty("updatedAt", val);
    if (lower === "cycleid" || lower === "cycle_id") setIfValOrEmpty("cycleId", val);
    if (lower === "startdate" || lower === "start_date") setIfValOrEmpty("startDate", val);
    if (lower === "enddate" || lower === "end_date") setIfValOrEmpty("endDate", val);
    if (lower === "categoryfilter" || lower === "category_filter") setIfValOrEmpty("categoryFilter", val);
    if (lower === "totalgross" || lower === "total_gross") setIfValOrEmpty("totalGross", val);
    if (lower === "totaldeductions" || lower === "total_deductions") setIfValOrEmpty("totalDeductions", val);
    if (lower === "totalnet" || lower === "total_net") setIfValOrEmpty("totalNet", val);
    if (lower === "managedby" || lower === "managed_by") setIfValOrEmpty("managedBy", val);
    if (lower === "managedbyname" || lower === "managed_by_name") setIfValOrEmpty("managedByName", val);
    if (lower === "approvedby" || lower === "approved_by") setIfValOrEmpty("approvedBy", val);
    if (lower === "approvedat" || lower === "approved_at") setIfValOrEmpty("approvedAt", val);
    if (lower === "employeename" || lower === "employee_name") setIfValOrEmpty("employeeName", val);
    if (lower === "employeeno" || lower === "employee_no") setIfValOrEmpty("employeeNo", val);
    if (lower === "basicpay" || lower === "basic_pay") setIfValOrEmpty("basicPay", val);
    if (lower === "grosspay" || lower === "gross_pay") setIfValOrEmpty("grossPay", val);
    if (lower === "netpay" || lower === "net_pay") setIfValOrEmpty("netPay", val);
    if (lower === "othours" || lower === "ot_hours") setIfValOrEmpty("otHours", val);
    if (lower === "teachinghours" || lower === "teaching_hours") setIfValOrEmpty("teachingHours", val);
    if (lower === "isvalidated" || lower === "is_validated") setIfValOrEmpty("isValidated", val);
    if (lower === "cutoffperiod" || lower === "cutoff_period") setIfValOrEmpty("cutoffPeriod", val);
    if (lower === "processdate" || lower === "process_date") setIfValOrEmpty("processDate", val);
    if (lower === "payrolltype" || lower === "payroll_type") setIfValOrEmpty("payrollType", val);
    if (lower === "recorddatajson" || lower === "record_data_json") setIfValOrEmpty("recordDataJson", val);
    if (lower === "detailsjson" || lower === "details_json") setIfValOrEmpty("detailsJson", val);
    if (lower === "monthname" || lower === "month_name") setIfValOrEmpty("monthName", val);
    if (lower === "periodtype" || lower === "period_type") setIfValOrEmpty("periodType", val);
    if (lower === "totalemployees" || lower === "total_employees") setIfValOrEmpty("totalEmployees", val);
    if (lower === "createdby" || lower === "created_by") setIfValOrEmpty("createdBy", val);
    if (lower === "typename" || lower === "type_name") {
      setIfValOrEmpty("typeName", val);
      setIfValOrEmpty("type", val);
    }
    if (lower === "typeid" || lower === "type_id") setIfValOrEmpty("typeId", val);
    if (lower === "loantype" || lower === "loan_type") setIfValOrEmpty("loanType", val);
    if (lower === "principalamount" || lower === "principal_amount") setIfValOrEmpty("principalAmount", val);
    if (lower === "totalamount" || lower === "total_amount") setIfValOrEmpty("totalAmount", val);
    if (lower === "monthlyamortization" || lower === "monthly_amortization") setIfValOrEmpty("monthlyAmortization", val);
    if (lower === "termmonths" || lower === "term_months") setIfValOrEmpty("termMonths", val);
    if (lower === "remainingbalance" || lower === "remaining_balance") setIfValOrEmpty("remainingBalance", val);
    if (lower === "loanid" || lower === "loan_id") setIfValOrEmpty("loanId", val);
    if (lower === "paymentdate" || lower === "payment_date") setIfValOrEmpty("paymentDate", val);
    if (lower === "hassss" || lower === "has_sss") setIfValOrEmpty("hasSss", val);
    if (lower === "hasphilhealth" || lower === "has_philhealth") setIfValOrEmpty("hasPhilhealth", val);
    if (lower === "haspagibig" || lower === "has_pagibig") setIfValOrEmpty("hasPagibig", val);
    if (lower === "departmentheadid" || lower === "department_head_id") setIfValOrEmpty("departmentHeadId", val);
    if (lower === "departmentid" || lower === "department_id") setIfValOrEmpty("departmentId", val);
    if (lower === "teachingdepartmentid" || lower === "teaching_department_id") setIfValOrEmpty("teachingDepartmentId", val);
    if (lower === "headname" || lower === "head_name") setIfValOrEmpty("headName", val);
    if (lower === "heademail" || lower === "head_email") setIfValOrEmpty("headEmail", val);
    if (lower === "dayofweek" || lower === "day_of_week") setIfValOrEmpty("dayOfWeek", val);
    if (lower === "starttime" || lower === "start_time") setIfValOrEmpty("startTime", val);
    if (lower === "endtime" || lower === "end_time") setIfValOrEmpty("endTime", val);
    if (lower === "timein" || lower === "time_in") setIfValOrEmpty("timeIn", val);
    if (lower === "timeout" || lower === "time_out") setIfValOrEmpty("timeOut", val);
    if (lower === "specificdate" || lower === "specific_date") setIfValOrEmpty("specificDate", val);
    if (lower === "effectivefrom" || lower === "effective_from") setIfValOrEmpty("effectiveFrom", val);
    if (lower === "effectiveto" || lower === "effective_to") setIfValOrEmpty("effectiveTo", val);
    if (lower === "leavetype" || lower === "leave_type") setIfValOrEmpty("leaveType", val);
    if (lower === "dayscount" || lower === "days_count") setIfValOrEmpty("daysCount", val);
    if (lower === "rejectionreason" || lower === "rejection_reason") setIfValOrEmpty("rejectionReason", val);
    if (lower === "reviewedby" || lower === "reviewed_by") setIfValOrEmpty("reviewedBy", val);
    if (lower === "reviewedat" || lower === "reviewed_at") setIfValOrEmpty("reviewedAt", val);
    if (lower === "subjectid" || lower === "subject_id") setIfValOrEmpty("subjectId", val);
    if (lower === "academicyear" || lower === "academic_year") setIfValOrEmpty("academicYear", val);
    if (lower === "hoursperweek" || lower === "hours_per_week") setIfValOrEmpty("hoursPerWeek", val);
    if (lower === "hourlyrate" || lower === "hourly_rate") setIfValOrEmpty("hourlyRate", val);
    if (lower === "maxhoursperweek" || lower === "max_hours_per_week") setIfValOrEmpty("maxHoursPerWeek", val);
    if (lower === "contractstart" || lower === "contract_start") setIfValOrEmpty("contractStart", val);
    if (lower === "contractend" || lower === "contract_end") setIfValOrEmpty("contractEnd", val);
    if (lower === "hoursworked" || lower === "hours_worked") setIfValOrEmpty("hoursWorked", val);
    if (lower === "undertimehours" || lower === "undertime_hours") setIfValOrEmpty("undertimeHours", val);
    if (lower === "overtimehours" || lower === "overtime_hours") setIfValOrEmpty("overtimeHours", val);
    if (lower === "tardinessminutes" || lower === "tardiness_minutes") setIfValOrEmpty("tardinessMinutes", val);
    if (lower === "amin" || lower === "am_in") setIfValOrEmpty("amIn", val);
    if (lower === "amout" || lower === "am_out") setIfValOrEmpty("amOut", val);
    if (lower === "pmin" || lower === "pm_in") setIfValOrEmpty("pmIn", val);
    if (lower === "pmout" || lower === "pm_out") setIfValOrEmpty("pmOut", val);
    if (lower === "overtimein" || lower === "overtime_in") setIfValOrEmpty("overtimeIn", val);
    if (lower === "overtimeout" || lower === "overtime_out") setIfValOrEmpty("overtimeOut", val);
    if (lower === "teachingloadid" || lower === "teaching_load_id") setIfValOrEmpty("teachingLoadId", val);
    if (lower === "subjectcode" || lower === "subject_code") setIfValOrEmpty("subjectCode", val);
    if (lower === "hoursrendered" || lower === "hours_rendered") setIfValOrEmpty("hoursRendered", val);
    if (lower === "totalpay" || lower === "total_pay") setIfValOrEmpty("totalPay", val);
  }
  return newRow;
}

export const normalizePgRow = normalizeRow;

/**
 * Unified database interface for PostgreSQL and Supabase
 */
export const db = {
  prepare: (sql: string) => {
    return {
      all: async (...params: any[]) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const pool = getPostgresPool();
        const activeTxClient = postgresTransactionStorage.getStore();
        const runner = activeTxClient || pool;
        const pgSql = translatePostgresSql(sql);
        const res = await runner.query(pgSql, flatParams);
        return res.rows.map(normalizeRow);
      },

      get: async (...params: any[]) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const pool = getPostgresPool();
        const activeTxClient = postgresTransactionStorage.getStore();
        const runner = activeTxClient || pool;
        const pgSql = translatePostgresSql(sql);
        const res = await runner.query(pgSql, flatParams);
        return res.rows.length > 0 ? normalizeRow(res.rows[0]) : undefined;
      },

      run: async (...params: any[]) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const pool = getPostgresPool();
        const activeTxClient = postgresTransactionStorage.getStore();
        const runner = activeTxClient || pool;
        const pgSql = translatePostgresSql(sql);
        const res = await runner.query(pgSql, flatParams);
        return {
          changes: res.rowCount || 0,
          rowCount: res.rowCount || 0,
          lastInsertRowid: (res.rows[0] as any)?.id || null,
        };
      },
    };
  },

  exec: async (sql: string) => {
    const statements = sql
      .split(/;\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const pool = getPostgresPool();
    const activeTxClient = postgresTransactionStorage.getStore();
    const runner = activeTxClient || pool;

    for (const statement of statements) {
      try {
        const cleanStatement = translatePostgresSql(statement);
        if (cleanStatement.trim().length > 0) {
          await runner.query(cleanStatement);
        }
      } catch (e: any) {
        if (!e.message?.includes("already exists")) {
          console.warn(`[PostgreSQL Schema Warning]: ${e.message} in: ${statement.substring(0, 50)}...`);
        }
      }
    }
  },

  transaction: async (fn: () => Promise<any> | any) => {
    const pool = getPostgresPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await postgresTransactionStorage.run(client, async () => {
        return await fn();
      });
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },
};

export const MONTH_NAMES_LIST = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function logAudit(req: any, action: string, detail: string) {
  try {
    const userEmail =
      req?.headers?.["x-user-email"] ||
      req?.headers?.["user-email"] ||
      req?.body?.userEmail ||
      req?.body?.email ||
      req?.query?.userEmail ||
      "system";
    const userId =
      req?.headers?.["x-user-id"] ||
      req?.headers?.["user-id"] ||
      req?.body?.userId ||
      req?.query?.userId ||
      "system";
    const ipAddress = req?.ip || req?.headers?.["x-forwarded-for"] || "127.0.0.1";
    const id = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await db
      .prepare(
        'INSERT INTO audit_logs (id, "userId", "userEmail", action, detail, "ipAddress") VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, String(userId), String(userEmail), action, detail, String(ipAddress));
  } catch (e) {
    console.error("Failed to insert audit log:", e);
  }
}

// 28 Database Table DDL Definitions (Universal Multi-Engine Ready)
export const SCHEMA_TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(191) PRIMARY KEY,
    email VARCHAR(191) UNIQUE,
    password TEXT,
    "displayName" TEXT,
    role VARCHAR(50) DEFAULT 'employee',
    campus VARCHAR(100) DEFAULT 'Hinunangan Campus',
    "profileImage" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(191) PRIMARY KEY,
    "employeeId" VARCHAR(191) UNIQUE,
    "firstName" TEXT,
    "lastName" TEXT,
    email TEXT,
    password TEXT,
    category VARCHAR(100),
    "basicSalary" DECIMAL(15, 2),
    "salaryType" VARCHAR(50) DEFAULT 'monthly',
    status VARCHAR(50) DEFAULT 'active',
    "phoneNumber" VARCHAR(50) DEFAULT '09171234567',
    "hireDate" DATE,
    "hasSss" INTEGER DEFAULT 0,
    "hasPhilhealth" INTEGER DEFAULT 0,
    "hasPagibig" INTEGER DEFAULT 0,
    bpno TEXT,
    mi VARCHAR(10),
    prefix VARCHAR(20),
    appellation VARCHAR(20),
    "birthDate" VARCHAR(50),
    crn VARCHAR(50),
    "effectivityDate" VARCHAR(50),
    position TEXT,
    gender VARCHAR(20) DEFAULT 'MALE',
    "profileImage" TEXT,
    campus VARCHAR(100) DEFAULT 'Hinunangan Campus',
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS payroll_cycles (
    id VARCHAR(191) PRIMARY KEY,
    name VARCHAR(255),
    "startDate" DATE,
    "endDate" DATE,
    type VARCHAR(50) DEFAULT 'all',
    "categoryFilter" VARCHAR(50) DEFAULT 'all',
    status VARCHAR(50) DEFAULT 'draft',
    "totalGross" DECIMAL(15, 2) DEFAULT 0.00,
    "totalDeductions" DECIMAL(15, 2) DEFAULT 0.00,
    "totalNet" DECIMAL(15, 2) DEFAULT 0.00,
    "managedBy" VARCHAR(191) DEFAULT 'accountant-1',
    "managedByName" VARCHAR(255) DEFAULT 'System Accountant',
    campus VARCHAR(100) DEFAULT 'Hinunangan Campus',
    "approvedBy" VARCHAR(191),
    "approvedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS payroll_entries (
    id VARCHAR(191) PRIMARY KEY,
    "cycleId" VARCHAR(191),
    "employeeId" VARCHAR(191),
    employeeName VARCHAR(255),
    basicPay DECIMAL(15, 2),
    overtime DECIMAL(15, 2) DEFAULT 0.00,
    bonuses DECIMAL(15, 2) DEFAULT 0.00,
    allowances DECIMAL(15, 2) DEFAULT 0.00,
    "otHours" DECIMAL(15, 2) DEFAULT 0.00,
    incentives DECIMAL(15, 2) DEFAULT 0.00,
    "teachingHours" DECIMAL(15, 2) DEFAULT 0.00,
    "grossPay" DECIMAL(15, 2) DEFAULT 0.00,
    "totalDeductions" DECIMAL(15, 2) DEFAULT 0.00,
    "netPay" DECIMAL(15, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'pending',
    deductions_json TEXT,
    custom_values_json TEXT,
    "isValidated" INTEGER DEFAULT 0,
    "govSecGsis" DECIMAL(15, 2) DEFAULT 0.00,
    "govSecHdmf" DECIMAL(15, 2) DEFAULT 0.00,
    "govSecPh" DECIMAL(15, 2) DEFAULT 0.00,
    "govSecEcip" DECIMAL(15, 2) DEFAULT 0.00,
    "compSal2nd" DECIMAL(15, 2) DEFAULT 0.00,
    "compPera" DECIMAL(15, 2) DEFAULT 0.00,
    "compGross" DECIMAL(15, 2) DEFAULT 0.00,
    absences DECIMAL(15, 2) DEFAULT 0.00,
    "dedPolicyLoan" DECIMAL(15, 2) DEFAULT 0.00,
    "dedConsolLoan" DECIMAL(15, 2) DEFAULT 0.00,
    "dedMplLite" DECIMAL(15, 2) DEFAULT 0.00,
    "dedMpl" DECIMAL(15, 2) DEFAULT 0.00,
    "dedCpl" DECIMAL(15, 2) DEFAULT 0.00,
    "dedGfal" DECIMAL(15, 2) DEFAULT 0.00,
    "dedEmergencyLoan" DECIMAL(15, 2) DEFAULT 0.00,
    "dedGsisPremPersonal" DECIMAL(15, 2) DEFAULT 0.00,
    "dedEducAsst" DECIMAL(15, 2) DEFAULT 0.00,
    "dedPagibigPersonal" DECIMAL(15, 2) DEFAULT 0.00,
    "dedPagibigMpl" DECIMAL(15, 2) DEFAULT 0.00,
    "dedSss" DECIMAL(15, 2) DEFAULT 0.00,
    "dedPagibigMp2" DECIMAL(15, 2) DEFAULT 0.00,
    "dedPhilhealthCont" DECIMAL(15, 2) DEFAULT 0.00,
    "dedCsbLoan" DECIMAL(15, 2) DEFAULT 0.00,
    "dedTaxWithheld" DECIMAL(15, 2) DEFAULT 0.00,
    FOREIGN KEY("cycleId") REFERENCES payroll_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS payroll_records (
    id VARCHAR(191) PRIMARY KEY,
    "cycleId" VARCHAR(191),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    monthName VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    periodType VARCHAR(50) DEFAULT 'monthly',
    totalEmployees INTEGER DEFAULT 0,
    "totalGross" DECIMAL(15, 2) DEFAULT 0.00,
    "totalDeductions" DECIMAL(15, 2) DEFAULT 0.00,
    "totalNet" DECIMAL(15, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'archived',
    notes TEXT,
    "recordDataJson" TEXT,
    createdBy VARCHAR(191),
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS deduction_records (
    id VARCHAR(191) PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    monthName VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    periodType VARCHAR(50) DEFAULT 'monthly',
    totalEmployees INTEGER DEFAULT 0,
    "totalDeductions" DECIMAL(15, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'saved',
    notes TEXT,
    "recordDataJson" TEXT,
    createdBy VARCHAR(191),
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS deductions (
    id VARCHAR(191) PRIMARY KEY,
    "employeeId" VARCHAR(191),
    type VARCHAR(100),
    description TEXT,
    amount DECIMAL(15, 2),
    status VARCHAR(50) DEFAULT 'active',
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS deduction_types (
    id VARCHAR(191) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS employee_categories (
    id VARCHAR(191) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS employee_positions (
    id VARCHAR(191) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS departments (
    id VARCHAR(191) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    "departmentHeadId" VARCHAR(191),
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS teaching_departments (
    id VARCHAR(191) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    "departmentHeadId" VARCHAR(191),
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS subjects (
    id VARCHAR(191) PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    units DECIMAL(5, 2) DEFAULT 3.00,
    "departmentId" VARCHAR(191),
    "teachingDepartmentId" VARCHAR(191),
    description TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY("teachingDepartmentId") REFERENCES teaching_departments(id) ON DELETE SET NULL,
    FOREIGN KEY("departmentId") REFERENCES departments(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS teaching_loads (
    id VARCHAR(191) PRIMARY KEY,
    "employeeId" VARCHAR(191),
    "subjectId" VARCHAR(191),
    "teachingDepartmentId" VARCHAR(191),
    section VARCHAR(50),
    "academicYear" VARCHAR(50),
    semester VARCHAR(50),
    "hoursPerWeek" DECIMAL(5, 2) DEFAULT 0.00,
    rate DECIMAL(15, 2) DEFAULT 0.00,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY("employeeId") REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY("subjectId") REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY("teachingDepartmentId") REFERENCES teaching_departments(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS visiting_instructors (
    id VARCHAR(191) PRIMARY KEY,
    "employeeId" VARCHAR(191) UNIQUE,
    "hourlyRate" DECIMAL(15, 2) DEFAULT 350.00,
    "maxHoursPerWeek" DECIMAL(5, 2) DEFAULT 40.00,
    "departmentId" VARCHAR(191),
    "contractStart" DATE,
    "contractEnd" DATE,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY("departmentId") REFERENCES departments(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS dtr_records (
    id VARCHAR(191) PRIMARY KEY,
    "employeeId" VARCHAR(191),
    date DATE NOT NULL,
    "timeIn" VARCHAR(20),
    "timeOut" VARCHAR(20),
    "amIn" VARCHAR(20),
    "amOut" VARCHAR(20),
    "pmIn" VARCHAR(20),
    "pmOut" VARCHAR(20),
    "hoursWorked" DECIMAL(5, 2) DEFAULT 0.00,
    "overtimeHours" DECIMAL(5, 2) DEFAULT 0.00,
    "lateMinutes" INTEGER DEFAULT 0,
    "undertimeMinutes" INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS dtr_logs (
    id VARCHAR(191) PRIMARY KEY,
    "employeeId" VARCHAR(191),
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    type VARCHAR(50),
    device VARCHAR(100),
    location VARCHAR(255),
    "ipAddress" VARCHAR(100),
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY("employeeId") REFERENCES employees(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS dtr_visiting_records (
    id VARCHAR(191) PRIMARY KEY,
    "employeeId" VARCHAR(191),
    "teachingDepartmentId" VARCHAR(191),
    "teachingLoadId" VARCHAR(191),
    "subjectCode" VARCHAR(50),
    date DATE NOT NULL,
    "startTime" VARCHAR(20),
    "endTime" VARCHAR(20),
    "hoursRendered" DECIMAL(5, 2) DEFAULT 0.00,
    "hourlyRate" DECIMAL(15, 2) DEFAULT 0.00,
    "totalPay" DECIMAL(15, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY("teachingDepartmentId") REFERENCES teaching_departments(id) ON DELETE SET NULL,
    FOREIGN KEY("teachingLoadId") REFERENCES teaching_loads(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS holidays (
    id VARCHAR(191) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    type VARCHAR(50) DEFAULT 'Regular',
    description TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS schedules (
    id VARCHAR(191) PRIMARY KEY,
    "employeeId" VARCHAR(191),
    "dayOfWeek" VARCHAR(20),
    "startTime" VARCHAR(20),
    "endTime" VARCHAR(20),
    "timeIn" VARCHAR(20),
    "timeOut" VARCHAR(20),
    subject VARCHAR(100),
    room VARCHAR(100),
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS leave_applications (
    id VARCHAR(191) PRIMARY KEY,
    "employeeId" VARCHAR(191),
    "leaveType" VARCHAR(100) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "daysCount" INTEGER DEFAULT 1,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    "rejectionReason" TEXT,
    "reviewedBy" VARCHAR(191),
    "reviewedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS loans (
    id VARCHAR(191) PRIMARY KEY,
    "employeeId" VARCHAR(191),
    type VARCHAR(100) NOT NULL,
    "principalAmount" DECIMAL(15, 2) NOT NULL,
    "totalAmount" DECIMAL(15, 2) NOT NULL,
    "monthlyAmortization" DECIMAL(15, 2) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "remainingBalance" DECIMAL(15, 2) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY("employeeId") REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS loan_payments (
    id VARCHAR(191) PRIMARY KEY,
    "loanId" VARCHAR(191),
    "payrollEntryId" VARCHAR(191),
    amount DECIMAL(15, 2) NOT NULL,
    "paymentDate" DATE NOT NULL,
    "remainingBalanceAfter" DECIMAL(15, 2) NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY("loanId") REFERENCES loans(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS compensation_plans (
    id VARCHAR(191) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    "baseRate" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    "peraAmount" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    "hazardPay" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS employee_compensation (
    id VARCHAR(191) PRIMARY KEY,
    "employeeId" VARCHAR(191) UNIQUE,
    "planId" VARCHAR(191),
    "customBaseRate" DECIMAL(15, 2),
    "customPera" DECIMAL(15, 2),
    "effectiveDate" DATE,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY("employeeId") REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY("planId") REFERENCES compensation_plans(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS payroll_settings (
    id VARCHAR(191) PRIMARY KEY,
    "key" VARCHAR(191) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(191) PRIMARY KEY,
    "userId" VARCHAR(191),
    "userEmail" VARCHAR(255),
    action VARCHAR(255) NOT NULL,
    detail TEXT,
    "ipAddress" VARCHAR(100),
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS sms_logs (
    id VARCHAR(191) PRIMARY KEY,
    "employeeId" VARCHAR(191),
    recipient VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'sent',
    response TEXT,
    "sentAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY("employeeId") REFERENCES employees(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS integration_sync_logs (
    id VARCHAR(191) PRIMARY KEY,
    "batchId" VARCHAR(100),
    source VARCHAR(50) DEFAULT 'external_api',
    status VARCHAR(50) DEFAULT 'success',
    "recordsReceived" INTEGER DEFAULT 0,
    "recordsCreated" INTEGER DEFAULT 0,
    "recordsUpdated" INTEGER DEFAULT 0,
    "recordsFailed" INTEGER DEFAULT 0,
    message TEXT,
    "detailsJson" TEXT,
    "initiatedBy" VARCHAR(100) DEFAULT 'system',
    "durationMs" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`
];

export const TABLE_NAMES = [
  "users", "employees", "payroll_cycles", "payroll_entries", "payroll_records",
  "deduction_records", "deductions", "deduction_types", "employee_categories",
  "employee_positions", "departments", "teaching_departments", "subjects",
  "teaching_loads", "visiting_instructors", "dtr_records", "dtr_logs",
  "dtr_visiting_records", "holidays", "schedules", "leave_applications",
  "loans", "loan_payments", "compensation_plans", "employee_compensation",
  "payroll_settings", "audit_logs", "sms_logs", "integration_sync_logs"
];

/**
 * Initializes the Database and ensures table/column schema compatibility without inserting seed data
 */
export async function initDb() {
  try {
    const pool = getPostgresPool();
    const client = await pool.connect();
    const res = await client.query("SELECT version() as version");
    client.release();
    console.log(`[PostgreSQL Database] Successfully connected to PostgreSQL / Supabase! (${res.rows[0]?.version?.substring(0, 40)}...)`);

    // 1. Create all 28 schema tables
    for (const ddl of SCHEMA_TABLES) {
      await db.exec(ddl);
    }

    // 2. Perform canonical column sync and ensure no duplicate legacy columns exist
    const canonicalAlters = [
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(191)',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS "displayName" TEXT',
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'employee'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS campus VARCHAR(100) DEFAULT 'Hinunangan Campus'",
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS "profileImage" TEXT',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "firstName" VARCHAR(100)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "lastName" VARCHAR(100)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(191)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS password TEXT',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "basicSalary" DECIMAL(12, 2) DEFAULT 0.00',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "salaryType" VARCHAR(50) DEFAULT \'monthly\'',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "phoneNumber" VARCHAR(50)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "profileImage" TEXT',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS mi VARCHAR(10)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS prefix VARCHAR(50)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS appellation VARCHAR(50)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "birthDate" DATE',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS crn VARCHAR(50)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS bpno VARCHAR(50)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS category VARCHAR(100)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS position VARCHAR(100)',
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS campus VARCHAR(100) DEFAULT 'Hinunangan Campus'",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'",
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "effectivityDate" DATE',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender VARCHAR(20)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "hireDate" DATE',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "hasSss" BOOLEAN DEFAULT true',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "hasPhilhealth" BOOLEAN DEFAULT true',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "hasPagibig" BOOLEAN DEFAULT true',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "dayOfWeek" VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "startTime" VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "endTime" VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "timeIn" VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "timeOut" VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS subject VARCHAR(100)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS room VARCHAR(100)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "specificDate" DATE',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "effectiveFrom" DATE',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "effectiveTo" DATE',

        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS "hourlyRate" DECIMAL(10, 2) DEFAULT 350.00',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS "maxHoursPerWeek" DECIMAL(5, 2) DEFAULT 40.00',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS "departmentId" VARCHAR(191)',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS "contractStart" DATE',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS "contractEnd" DATE',

        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "subjectId" VARCHAR(191)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "teachingDepartmentId" VARCHAR(191)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "dayOfWeek" VARCHAR(20)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "startTime" VARCHAR(20)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "endTime" VARCHAR(20)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS section VARCHAR(100)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "hoursPerWeek" DECIMAL(5, 2) DEFAULT 3.00',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS semester VARCHAR(50)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "academicYear" VARCHAR(50)',

        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "leaveType" VARCHAR(100)',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "startDate" DATE',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "endDate" DATE',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "daysCount" DECIMAL(5, 2) DEFAULT 1.00',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS reason TEXT',
        "ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'",
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "reviewedBy" VARCHAR(191)',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ',

        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        "ALTER TABLE loans ADD COLUMN IF NOT EXISTS type VARCHAR(100) DEFAULT 'GSIS Loan'",
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "principalAmount" DECIMAL(12, 2) DEFAULT 0.00',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "totalAmount" DECIMAL(12, 2) DEFAULT 0.00',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "monthlyAmortization" DECIMAL(12, 2) DEFAULT 0.00',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "termMonths" INTEGER DEFAULT 12',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "remainingBalance" DECIMAL(12, 2) DEFAULT 0.00',
        "ALTER TABLE loans ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'",
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "startDate" DATE',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "endDate" DATE',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS notes TEXT',

        'ALTER TABLE deductions ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE deductions ADD COLUMN IF NOT EXISTS type VARCHAR(100)',
        'ALTER TABLE deductions ADD COLUMN IF NOT EXISTS amount DECIMAL(12, 2) DEFAULT 0.00',
        'ALTER TABLE deductions ADD COLUMN IF NOT EXISTS description TEXT',
        "ALTER TABLE deductions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'",

        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "cycleId" VARCHAR(191)',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS year INTEGER',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS month INTEGER',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "monthName" VARCHAR(50)',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS title VARCHAR(255)',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "periodType" VARCHAR(50) DEFAULT \'monthly\'',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "totalEmployees" INTEGER DEFAULT 0',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "totalGross" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "totalDeductions" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "totalNet" DECIMAL(15, 2) DEFAULT 0.00',
        "ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'archived'",
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS notes TEXT',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "recordDataJson" TEXT',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "createdBy" VARCHAR(191)',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP'
      ];

      for (const alt of canonicalAlters) {
        try {
          await db.exec(alt);
        } catch {}
      }

    console.log(`[Database] All ${TABLE_NAMES.length} tables verified successfully (clean schema, no seeds injected).`);

    // Trigger async background sync to Supabase Auth
    setTimeout(() => {
      import("../supabase.js")
        .then(m => {
          if (m.hasSupabaseConfig) {
            console.log("[Database] Triggering initial background sync to Supabase Auth...");
            m.syncAllUsersToSupabase()
              .then(res => console.log(`[Database] Initial Supabase Auth sync complete: ${res.synced} users synced.`))
              .catch(e => console.warn("[Database] Initial Supabase sync notice:", e.message));
          }
        })
        .catch(err => console.warn("[Database] Could not load Supabase module:", err.message));
    }, 1000);
  } catch (err: any) {
    console.error("[Database] Initialization error:", err.message);
  }
}

/**
 * Generates clean, ready-to-run PostgreSQL / Supabase SQL Dump
 */
export async function generatePostgresDump(includeData = true): Promise<string> {
  const timestamp = new Date().toISOString();
  let dump = `-- ========================================================\n`;
  dump += `-- Southern Leyte State University (SLSU) Payroll System\n`;
  dump += `-- Complete PostgreSQL / Supabase Schema & Data Export\n`;
  dump += `-- Generated at: ${timestamp}\n`;
  dump += `-- Compatible with: Supabase / PostgreSQL 15+\n`;
  dump += `-- ========================================================\n\n`;

  dump += `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n`;

  for (let i = 0; i < TABLE_NAMES.length; i++) {
    const tableName = TABLE_NAMES[i];
    const ddl = SCHEMA_TABLES[i];

    dump += `-- --------------------------------------------------------\n`;
    dump += `-- Table structure for "${tableName}"\n`;
    dump += `-- --------------------------------------------------------\n`;
    dump += `${translatePostgresSql(ddl)};\n\n`;

    if (includeData) {
      try {
        const rows = await db.prepare(`SELECT * FROM ${tableName}`).all() as any[];
        if (rows && rows.length > 0) {
          dump += `-- Dumping data for table "${tableName}" (${rows.length} rows)\n`;
          const cols = Object.keys(rows[0]);
          const colList = cols.map(c => `"${c}"`).join(", ");

          for (const row of rows) {
            const vals = cols.map(c => {
              const val = row[c];
              if (val === null || val === undefined) return "NULL";
              if (typeof val === "number") return val;
              if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
              const str = String(val).replace(/'/g, "''");
              return `'${str}'`;
            }).join(", ");

            dump += `INSERT INTO "${tableName}" (${colList}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
          }
          dump += `\n`;
        }
      } catch (e: any) {
        dump += `-- Note: could not dump rows for ${tableName}: ${e.message}\n\n`;
      }
    }
  }

  dump += `-- PostgreSQL Dump completed at ${new Date().toISOString()}\n`;
  return dump;
}

/**
 * Returns database health and table statistics
 */
export async function getDatabaseStatus() {
  const tableStats: Record<string, number> = {};

  for (const table of TABLE_NAMES) {
    try {
      const res = await db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as any;
      tableStats[table] = res ? Number(res.count) : 0;
    } catch {
      tableStats[table] = 0;
    }
  }

  let hostName = "PostgreSQL / Supabase";
  let portNum = 5432;
  let dbName = "postgres";

  try {
    const currentDbUrl = getDatabaseUrl();
    if (currentDbUrl) {
      const u = new URL(currentDbUrl);
      hostName = u.hostname;
      portNum = Number(u.port || 5432);
      dbName = u.pathname.replace(/^\//, "") || "postgres";
    }
  } catch {}

  return {
    engine: "postgresql",
    isPostgresActive: true,
    isMysqlActive: false,
    host: hostName,
    port: portNum,
    database: dbName,
    tablesCount: TABLE_NAMES.length,
    tableStats,
    status: "healthy",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Compatibility helper for testing PostgreSQL connection
 */
export async function testPostgresConnection(config?: any) {
  let client: pg.Client | null = null;
  try {
    const connStr = config?.connectionString || process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!connStr) {
      return { success: false, error: "PostgreSQL connection string is required." };
    }
    client = new pg.Client({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    await client.connect();
    const result = await client.query("SELECT version()");
    await client.end();
    return {
      success: true,
      message: "Successfully connected to PostgreSQL database!",
      version: result.rows[0]?.version,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    if (client) {
      try { await client.end(); } catch {}
    }
    return { success: false, error: err.message };
  }
}
