import { AsyncLocalStorage } from "async_hooks";
import dotenv from "dotenv";
import pg from "pg";
import mysql from "mysql2/promise";

dotenv.config();

// Disable SSL certificate verification rejection for cloud run / pooler environments
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Transaction context storages
const postgresTransactionStorage = new AsyncLocalStorage<pg.PoolClient>();
const mysqlTransactionStorage = new AsyncLocalStorage<mysql.PoolConnection>();

// Database Connection URL detection
const rawDatabaseUrl =
  process.env.DATABASE_URL ||
  process.env.MYSQL_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL ||
  "";

// Engine flags
export const isMysql = Boolean(
  rawDatabaseUrl.startsWith("mysql://") ||
  rawDatabaseUrl.startsWith("mysql:") ||
  Boolean(process.env.MYSQL_HOST) ||
  Boolean(process.env.MYSQL_URL)
);

export const isPostgres = Boolean(
  !isMysql && (
    rawDatabaseUrl.startsWith("postgres://") ||
    rawDatabaseUrl.startsWith("postgresql://") ||
    Boolean(process.env.POSTGRES_URL) ||
    Boolean(process.env.SUPABASE_DB_URL)
  )
);

export const isSupabaseConfigured = Boolean(
  isPostgres || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
);

// Connection pools
let postgresPool: pg.Pool | null = null;
let mysqlPool: mysql.Pool | null = null;

/**
 * Creates or returns the dedicated MySQL connection pool
 */
export function getMysqlPool(): mysql.Pool {
  if (!mysqlPool) {
    let poolConfig: mysql.PoolOptions = {};
    const mysqlUrl = process.env.MYSQL_URL || (rawDatabaseUrl.startsWith("mysql") ? rawDatabaseUrl : "");

    if (mysqlUrl) {
      try {
        const u = new URL(mysqlUrl);
        poolConfig = {
          host: u.hostname,
          port: Number(u.port) || 3306,
          user: decodeURIComponent(u.username),
          password: decodeURIComponent(u.password),
          database: u.pathname.replace(/^\//, ""),
          ssl: { rejectUnauthorized: false },
          waitForConnections: true,
          connectionLimit: 20,
          idleTimeout: 30000,
          enableKeepAlive: true,
        };
      } catch {
        poolConfig = {
          uri: mysqlUrl,
          ssl: { rejectUnauthorized: false },
          waitForConnections: true,
          connectionLimit: 20,
        };
      }
    } else {
      poolConfig = {
        host: process.env.MYSQL_HOST || "localhost",
        port: Number(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER || "root",
        password: process.env.MYSQL_PASSWORD || "",
        database: process.env.MYSQL_DATABASE || "payroll-latest",
        ssl: { rejectUnauthorized: false },
        waitForConnections: true,
        connectionLimit: 20,
      };
    }

    mysqlPool = mysql.createPool(poolConfig);
    console.log("[MySQL Pool] MySQL connection pool initialized.");
  }
  return mysqlPool;
}

/**
 * Creates or returns the dedicated PostgreSQL / Supabase connection pool
 */
export function getPostgresPool(): pg.Pool {
  if (!postgresPool) {
    const pgUrl = process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || (rawDatabaseUrl.startsWith("postgres") ? rawDatabaseUrl : "");

    postgresPool = new pg.Pool({
      connectionString: pgUrl || undefined,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    postgresPool.on("error", (err) => {
      console.error("[PostgreSQL Pool Error]:", err.message);
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

/**
 * Translates queries and DDL to valid MySQL syntax
 */
export function translateMysqlSql(sql: string): string {
  let finalSql = sql;

  // 1. Convert PostgreSQL ON CONFLICT to MySQL equivalent
  finalSql = finalSql.replace(/INSERT\s+INTO\s+(.+?)\s+ON\s+CONFLICT\s*(?:\([^\)]*\))?\s*DO\s+NOTHING/gis, "INSERT IGNORE INTO $1");
  finalSql = finalSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT IGNORE INTO");
  finalSql = finalSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "REPLACE INTO");

  // 2. Translate PostgreSQL data types to standard MySQL types
  finalSql = finalSql.replace(/\bTIMESTAMPTZ\b/gi, "DATETIME");
  finalSql = finalSql.replace(/\bSERIAL\s+PRIMARY\s+KEY\b/gi, "INT AUTO_INCREMENT PRIMARY KEY");
  finalSql = finalSql.replace(/\bSERIAL\b/gi, "INT AUTO_INCREMENT");

  // 3. Convert double quotes around column identifiers to backticks or bare
  finalSql = finalSql.replace(/"([a-zA-Z0-9_]+)"/g, "`$1`");

  // 4. Handle PRAGMA commands
  if (/PRAGMA\s+table_info\s*\(\s*(\w+)\s*\)/i.test(finalSql)) {
    const match = finalSql.match(/PRAGMA\s+table_info\s*\(\s*(\w+)\s*\)/i);
    const tableName = match ? match[1] : "";
    return `SELECT column_name as name, data_type as type, is_nullable = 'NO' as notnull, column_default as dflt_value, 0 as pk FROM information_schema.columns WHERE table_name = '${tableName.toLowerCase()}'`;
  }

  return finalSql;
}

// Backward-compatible alias
export const translateSql = isMysql ? translateMysqlSql : translatePostgresSql;

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
 * Unified database interface for MySQL, PostgreSQL, and Supabase
 */
export const db = {
  prepare: (sql: string) => {
    return {
      all: async (...params: any[]) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;

        if (isMysql) {
          const pool = getMysqlPool();
          const activeTxConn = mysqlTransactionStorage.getStore();
          const runner = activeTxConn || pool;
          const mysqlSql = translateMysqlSql(sql);
          const [rows] = await runner.query(mysqlSql, flatParams);
          return (Array.isArray(rows) ? rows : []).map(normalizeRow);
        } else {
          const pool = getPostgresPool();
          const activeTxClient = postgresTransactionStorage.getStore();
          const runner = activeTxClient || pool;
          const pgSql = translatePostgresSql(sql);
          const res = await runner.query(pgSql, flatParams);
          return res.rows.map(normalizeRow);
        }
      },

      get: async (...params: any[]) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;

        if (isMysql) {
          const pool = getMysqlPool();
          const activeTxConn = mysqlTransactionStorage.getStore();
          const runner = activeTxConn || pool;
          const mysqlSql = translateMysqlSql(sql);
          const [rows] = await runner.query(mysqlSql, flatParams);
          const list = Array.isArray(rows) ? rows : [];
          return list.length > 0 ? normalizeRow(list[0]) : undefined;
        } else {
          const pool = getPostgresPool();
          const activeTxClient = postgresTransactionStorage.getStore();
          const runner = activeTxClient || pool;
          const pgSql = translatePostgresSql(sql);
          const res = await runner.query(pgSql, flatParams);
          return res.rows.length > 0 ? normalizeRow(res.rows[0]) : undefined;
        }
      },

      run: async (...params: any[]) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;

        if (isMysql) {
          const pool = getMysqlPool();
          const activeTxConn = mysqlTransactionStorage.getStore();
          const runner = activeTxConn || pool;
          const mysqlSql = translateMysqlSql(sql);
          const [res]: any = await runner.query(mysqlSql, flatParams);
          return {
            changes: res?.affectedRows || 0,
            rowCount: res?.affectedRows || 0,
            lastInsertRowid: res?.insertId || null,
          };
        } else {
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
        }
      },
    };
  },

  exec: async (sql: string) => {
    const statements = sql
      .split(/;\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (isMysql) {
      const pool = getMysqlPool();
      const activeTxConn = mysqlTransactionStorage.getStore();
      const runner = activeTxConn || pool;

      for (const statement of statements) {
        try {
          const cleanStatement = translateMysqlSql(statement);
          if (cleanStatement.trim().length > 0) {
            await runner.query(cleanStatement);
          }
        } catch (e: any) {
          // Ignore table/column already exists warnings
          if (!e.message?.includes("already exists") && !e.message?.includes("Duplicate column")) {
            console.warn(`[MySQL Schema Warning]: ${e.message} in: ${statement.substring(0, 50)}...`);
          }
        }
      }
    } else {
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
    }
  },

  transaction: async (fn: () => Promise<any> | any) => {
    if (isMysql) {
      const pool = getMysqlPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const result = await mysqlTransactionStorage.run(conn, async () => {
          return await fn();
        });
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } else {
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
 * Initializes the Database, creates missing tables/columns, and seeds initial data
 */
export async function initDb() {
  try {
    if (isMysql) {
      const pool = getMysqlPool();
      const [rows]: any = await pool.query("SELECT 1 + 1 as test");
      console.log(`[MySQL Database] Successfully connected to MySQL database! (test result: ${rows[0]?.test})`);
    } else {
      const pool = getPostgresPool();
      const client = await pool.connect();
      const res = await client.query("SELECT version() as version");
      client.release();
      console.log(`[PostgreSQL Database] Successfully connected to PostgreSQL / Supabase! (${res.rows[0]?.version?.substring(0, 40)}...)`);
    }

    // 1. Create all 28 schema tables
    for (const ddl of SCHEMA_TABLES) {
      await db.exec(ddl);
    }

    // 2. Perform non-destructive column sync (handles any existing legacy column variations)
    if (!isMysql) {
      const requiredAlters = [
        'ALTER TABLE users ALTER COLUMN display_name DROP NOT NULL',
        'ALTER TABLE users ALTER COLUMN displayname DROP NOT NULL',
        'ALTER TABLE users ALTER COLUMN campus DROP NOT NULL',
        'ALTER TABLE users ALTER COLUMN "displayName" DROP NOT NULL',
        'ALTER TABLE employees ALTER COLUMN first_name DROP NOT NULL',
        'ALTER TABLE employees ALTER COLUMN last_name DROP NOT NULL',
        'ALTER TABLE employees ALTER COLUMN employee_id DROP NOT NULL',
        'ALTER TABLE employees ALTER COLUMN phone_number DROP NOT NULL',
        'ALTER TABLE employees ALTER COLUMN hire_date DROP NOT NULL',
        'ALTER TABLE employees ALTER COLUMN hiredate DROP NOT NULL',
        'ALTER TABLE employees ALTER COLUMN birth_date DROP NOT NULL',
        'ALTER TABLE employees ALTER COLUMN birthdate DROP NOT NULL',
        'ALTER TABLE employees ALTER COLUMN effectivity_date DROP NOT NULL',
        'ALTER TABLE employees ALTER COLUMN effectivitydate DROP NOT NULL',
        'ALTER TABLE employees ALTER COLUMN basic_salary DROP NOT NULL',
        'ALTER TABLE employees ALTER COLUMN salary_type DROP NOT NULL',
        'ALTER TABLE employees ALTER COLUMN profile_image DROP NOT NULL',
        'ALTER TABLE departments ALTER COLUMN campus DROP NOT NULL',
        'ALTER TABLE departments ALTER COLUMN code DROP NOT NULL',
        'ALTER TABLE teaching_departments ALTER COLUMN campus DROP NOT NULL',
        'ALTER TABLE teaching_departments ALTER COLUMN code DROP NOT NULL',
        'ALTER TABLE subjects ALTER COLUMN campus DROP NOT NULL',
        'ALTER TABLE subjects ALTER COLUMN department_id DROP NOT NULL',
        'ALTER TABLE subjects ALTER COLUMN hours_per_week DROP NOT NULL',

        'ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(191)',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS "displayName" TEXT',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS displayname TEXT',
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'employee'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS campus VARCHAR(100) DEFAULT 'Hinunangan Campus'",
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS "profileImage" TEXT',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_id VARCHAR(191)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "firstName" TEXT',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS first_name TEXT',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "lastName" TEXT',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_name TEXT',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS email TEXT',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS password TEXT',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS category VARCHAR(100)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "basicSalary" DECIMAL(15, 2)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS basic_salary DECIMAL(15, 2)',
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS \"salaryType\" VARCHAR(50) DEFAULT 'monthly'",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_type VARCHAR(50) DEFAULT 'monthly'",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'",
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "phoneNumber" VARCHAR(50)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "hireDate" DATE',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS hire_date DATE',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS hiredate DATE',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "hasSss" INTEGER DEFAULT 0',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_sss INTEGER DEFAULT 0',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "hasPhilhealth" INTEGER DEFAULT 0',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_philhealth INTEGER DEFAULT 0',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "hasPagibig" INTEGER DEFAULT 0',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_pagibig INTEGER DEFAULT 0',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS bpno TEXT',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS mi VARCHAR(10)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS prefix VARCHAR(20)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS appellation VARCHAR(20)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "birthDate" VARCHAR(50)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS birth_date VARCHAR(50)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS birthdate VARCHAR(50)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS crn VARCHAR(50)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "effectivityDate" VARCHAR(50)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS effectivity_date VARCHAR(50)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS effectivitydate VARCHAR(50)',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS position TEXT',
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender VARCHAR(20) DEFAULT 'MALE'",
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "profileImage" TEXT',
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS campus VARCHAR(100) DEFAULT 'Hinunangan Campus'",
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        // payroll_cycles columns
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS "startDate" DATE',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS start_date DATE',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS "endDate" DATE',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS end_date DATE',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS "categoryFilter" VARCHAR(50) DEFAULT \'all\'',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS category_filter VARCHAR(50) DEFAULT \'all\'',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS "totalGross" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS total_gross DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS "totalDeductions" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS total_deductions DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS "totalNet" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS total_net DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS "managedBy" VARCHAR(191) DEFAULT \'accountant-1\'',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS managed_by VARCHAR(191) DEFAULT \'accountant-1\'',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS "managedByName" VARCHAR(255) DEFAULT \'System Accountant\'',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS managed_by_name VARCHAR(255) DEFAULT \'System Accountant\'',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS campus VARCHAR(100) DEFAULT \'Hinunangan Campus\'',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT \'all\'',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT \'draft\'',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS "approvedBy" VARCHAR(191)',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS approved_by VARCHAR(191)',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ',
        'ALTER TABLE payroll_cycles ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ',

        // payroll_entries columns
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "cycleId" VARCHAR(191)',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS cycle_id VARCHAR(191)',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS employee_id VARCHAR(191)',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "employeeName" VARCHAR(255)',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS employee_name VARCHAR(255)',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "basicPay" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS basic_pay DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS basicpay DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS overtime DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS bonuses DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS allowances DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "otHours" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ot_hours DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS othours DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS incentives DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "teachingHours" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS teaching_hours DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS teachinghours DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "grossPay" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS gross_pay DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS grosspay DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "totalDeductions" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS total_deductions DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS totaldeductions DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "netPay" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS net_pay DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS netpay DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT \'pending\'',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS deductions_json TEXT',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS custom_values_json TEXT',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "isValidated" INTEGER DEFAULT 0',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS is_validated INTEGER DEFAULT 0',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS isvalidated INTEGER DEFAULT 0',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "govSecGsis" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS gov_sec_gsis DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "govSecHdmf" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS gov_sec_hdmf DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "govSecPh" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS gov_sec_ph DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "govSecEcip" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS gov_sec_ecip DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "compSal2nd" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS comp_sal_2nd DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "compPera" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS comp_pera DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "compGross" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS comp_gross DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS absences DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedPolicyLoan" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_policy_loan DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedConsolLoan" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_consol_loan DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedMplLite" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_mpl_lite DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedMpl" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_mpl DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedCpl" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_cpl DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedGfal" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_gfal DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedEmergencyLoan" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_emergency_loan DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedGsisPremPersonal" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_gsis_prem_personal DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedEducAsst" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_educ_asst DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedPagibigPersonal" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_pagibig_personal DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedPagibigMpl" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_pagibig_mpl DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedSss" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_sss DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedPagibigMp2" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_pagibig_mp2 DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedPhilhealthCont" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_philhealth_cont DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedCsbLoan" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_csb_loan DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS "dedTaxWithheld" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ded_tax_withheld DECIMAL(15, 2) DEFAULT 0.00',

        // payroll_records columns
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "cycleId" VARCHAR(191)',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS cycle_id VARCHAR(191)',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "processDate" DATE',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS process_date DATE',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "cutoffPeriod" VARCHAR(100)',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS cutoff_period VARCHAR(100)',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "payrollType" VARCHAR(50)',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS payroll_type VARCHAR(50)',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "recordDataJson" TEXT',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS record_data_json TEXT',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "totalGross" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS total_gross DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "totalDeductions" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS total_deductions DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS "totalNet" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS total_net DECIMAL(15, 2) DEFAULT 0.00',

        // audit_logs columns
        'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "userId" VARCHAR(191)',
        'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id VARCHAR(191)',
        'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "userEmail" VARCHAR(255)',
        'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_email VARCHAR(255)',
        'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "ipAddress" VARCHAR(100)',
        'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100)',
        'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "detailsJson" TEXT',
        'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details_json TEXT',

        // deduction_records columns
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS "monthName" VARCHAR(50)',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS month_name VARCHAR(50)',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS title VARCHAR(255)',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS "periodType" VARCHAR(50) DEFAULT \'all\'',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS period_type VARCHAR(50) DEFAULT \'all\'',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS "totalEmployees" INTEGER DEFAULT 0',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS total_employees INTEGER DEFAULT 0',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS "totalDeductions" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS total_deductions DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT \'saved\'',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS notes TEXT',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS "recordDataJson" TEXT',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS record_data_json TEXT',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS "detailsJson" TEXT',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS details_json TEXT',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS "createdBy" VARCHAR(191)',
        'ALTER TABLE deduction_records ADD COLUMN IF NOT EXISTS created_by VARCHAR(191)',

        // deductions columns
        'ALTER TABLE deductions ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE deductions ADD COLUMN IF NOT EXISTS employee_id VARCHAR(191)',
        'ALTER TABLE deductions ADD COLUMN IF NOT EXISTS type VARCHAR(100)',
        'ALTER TABLE deductions ADD COLUMN IF NOT EXISTS type_name VARCHAR(100)',
        'ALTER TABLE deductions ADD COLUMN IF NOT EXISTS type_id VARCHAR(100)',
        'ALTER TABLE deductions ADD COLUMN IF NOT EXISTS description TEXT',
        'ALTER TABLE deductions ADD COLUMN IF NOT EXISTS amount DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE deductions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT \'active\'',
        'ALTER TABLE deductions ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE deductions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE deductions ALTER COLUMN type_id DROP NOT NULL',
        'ALTER TABLE deductions ALTER COLUMN type_name DROP NOT NULL',
        'ALTER TABLE deductions ALTER COLUMN employee_id DROP NOT NULL',
        'ALTER TABLE deductions ALTER COLUMN type_id SET DEFAULT \'\'',
        'ALTER TABLE deductions ALTER COLUMN type_name SET DEFAULT \'\'',

        // deduction_types columns
        'ALTER TABLE deduction_types ADD COLUMN IF NOT EXISTS name VARCHAR(100)',
        'ALTER TABLE deduction_types ADD COLUMN IF NOT EXISTS description TEXT',
        'ALTER TABLE deduction_types ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE deduction_types ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        // loans columns
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS employee_id VARCHAR(191)',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "loanType" VARCHAR(100)',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS loan_type VARCHAR(100)',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "principalAmount" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS principal_amount DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "totalAmount" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "monthlyAmortization" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS monthly_amortization DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "termMonths" INTEGER DEFAULT 12',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS term_months INTEGER DEFAULT 12',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "remainingBalance" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT \'active\'',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "startDate" DATE',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS start_date DATE',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "endDate" DATE',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS end_date DATE',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS notes TEXT',

        // loan_applications & loans columns
        'ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE loans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        // dtr_records columns
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS employee_id VARCHAR(191)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "timeIn" VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS time_in VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "timeOut" VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS time_out VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "amIn" VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS am_in VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "amOut" VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS am_out VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "pmIn" VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS pm_in VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "pmOut" VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS pm_out VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "hoursWorked" DECIMAL(5, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS hours_worked DECIMAL(5, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "overtimeHours" DECIMAL(5, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS overtime_hours DECIMAL(5, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "lateMinutes" INTEGER DEFAULT 0',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "undertimeMinutes" INTEGER DEFAULT 0',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS undertime_minutes INTEGER DEFAULT 0',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        // dtr_logs columns
        'ALTER TABLE dtr_logs ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE dtr_logs ADD COLUMN IF NOT EXISTS employee_id VARCHAR(191)',
        'ALTER TABLE dtr_logs ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT \'manual\'',
        'ALTER TABLE dtr_logs ADD COLUMN IF NOT EXISTS notes TEXT',
        'ALTER TABLE dtr_logs ADD COLUMN IF NOT EXISTS "ipAddress" VARCHAR(100)',
        'ALTER TABLE dtr_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100)',
        'ALTER TABLE dtr_logs ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE dtr_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        // dtr_visiting_records columns
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS employee_id VARCHAR(191)',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS "teachingDepartmentId" VARCHAR(191)',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS teaching_department_id VARCHAR(191)',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS "teachingLoadId" VARCHAR(191)',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS teaching_load_id VARCHAR(191)',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS "subjectCode" VARCHAR(50)',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS subject_code VARCHAR(50)',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS "startTime" VARCHAR(20)',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS start_time VARCHAR(20)',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS "endTime" VARCHAR(20)',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS end_time VARCHAR(20)',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS "hoursRendered" DECIMAL(5, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS hours_rendered DECIMAL(5, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS "hourlyRate" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS "totalPay" DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS total_pay DECIMAL(15, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE dtr_visiting_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        // schedules columns
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS employee_id VARCHAR(191)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS employeeid VARCHAR(191)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "dayOfWeek" VARCHAR(50)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS day_of_week VARCHAR(50)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS dayofweek VARCHAR(50)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "startTime" VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS start_time VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS starttime VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "endTime" VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS end_time VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS endtime VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "timeIn" VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS time_in VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS timein VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "timeOut" VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS time_out VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS timeout VARCHAR(20)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS subject VARCHAR(100)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS room VARCHAR(100)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "specificDate" VARCHAR(50)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS specific_date VARCHAR(50)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS specificdate VARCHAR(50)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "effectiveFrom" VARCHAR(50)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS effective_from VARCHAR(50)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS effectivefrom VARCHAR(50)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "effectiveTo" VARCHAR(50)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS effective_to VARCHAR(50)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS effectiveto VARCHAR(50)',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE schedules ADD COLUMN IF NOT EXISTS createdat TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        // teaching_loads columns
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS employee_id VARCHAR(191)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS employeeid VARCHAR(191)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "dayOfWeek" VARCHAR(50)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS day_of_week VARCHAR(50)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS dayofweek VARCHAR(50)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "startTime" VARCHAR(20)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS start_time VARCHAR(20)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS starttime VARCHAR(20)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "endTime" VARCHAR(20)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS end_time VARCHAR(20)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS endtime VARCHAR(20)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "subjectId" VARCHAR(191)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS subject_id VARCHAR(191)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS subjectid VARCHAR(191)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "teachingDepartmentId" VARCHAR(191)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS teaching_department_id VARCHAR(191)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS teachingdepartmentid VARCHAR(191)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "hoursPerWeek" DECIMAL(5, 2) DEFAULT 3.00',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS hours_per_week DECIMAL(5, 2) DEFAULT 3.00',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS hoursperweek DECIMAL(5, 2) DEFAULT 3.00',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "academicYear" VARCHAR(50)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS academic_year VARCHAR(50)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS academicyear VARCHAR(50)',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE teaching_loads ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        // visiting_instructors columns
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS employee_id VARCHAR(191)',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS employeeid VARCHAR(191)',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS "hourlyRate" DECIMAL(15, 2) DEFAULT 350.00',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(15, 2) DEFAULT 350.00',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS hourlyrate DECIMAL(15, 2) DEFAULT 350.00',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS "maxHoursPerWeek" DECIMAL(5, 2) DEFAULT 40.00',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS max_hours_per_week DECIMAL(5, 2) DEFAULT 40.00',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS maxhoursperweek DECIMAL(5, 2) DEFAULT 40.00',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS "departmentId" VARCHAR(191)',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS department_id VARCHAR(191)',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS departmentid VARCHAR(191)',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS "contractStart" DATE',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS contract_start DATE',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS contractstart DATE',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS "contractEnd" DATE',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS contract_end DATE',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS contractend DATE',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS designation VARCHAR(100)',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE visiting_instructors ADD COLUMN IF NOT EXISTS createdat TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        // dtr_records columns
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS employee_id VARCHAR(191)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS employeeid VARCHAR(191)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "timeIn" VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS time_in VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS timein VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "timeOut" VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS time_out VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS timeout VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "amIn" VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS am_in VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS amin VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "amOut" VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS am_out VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS amout VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "pmIn" VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS pm_in VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS pmin VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "pmOut" VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS pm_out VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS pmout VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "overtimeIn" VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS overtime_in VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "overtimeOut" VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS overtime_out VARCHAR(20)',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "hoursWorked" DECIMAL(5, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS hours_worked DECIMAL(5, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "undertimeHours" DECIMAL(5, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS undertime_hours DECIMAL(5, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "overtimeHours" DECIMAL(5, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS overtime_hours DECIMAL(5, 2) DEFAULT 0.00',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "tardinessMinutes" INTEGER DEFAULT 0',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS tardiness_minutes INTEGER DEFAULT 0',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE dtr_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        // leave_applications columns
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS employee_id VARCHAR(191)',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS employeeid VARCHAR(191)',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "leaveType" VARCHAR(100)',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS leave_type VARCHAR(100)',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS leavetype VARCHAR(100)',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "startDate" DATE',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS start_date DATE',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS startdate DATE',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "endDate" DATE',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS end_date DATE',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS enddate DATE',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "daysCount" INTEGER DEFAULT 1',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS days_count INTEGER DEFAULT 1',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS dayscount INTEGER DEFAULT 1',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS rejection_reason TEXT',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS rejectionreason TEXT',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "reviewedBy" VARCHAR(191)',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(191)',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS reviewedby VARCHAR(191)',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS reviewedat TIMESTAMPTZ',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS employee_id VARCHAR(191)',
        'ALTER TABLE employee_compensation ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)',
        'ALTER TABLE employee_compensation ADD COLUMN IF NOT EXISTS employee_id VARCHAR(191)',

        // integration_sync_logs columns
        'ALTER TABLE integration_sync_logs ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE integration_sync_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        // departments columns
        'ALTER TABLE departments ADD COLUMN IF NOT EXISTS "departmentHeadId" VARCHAR(191)',
        'ALTER TABLE departments ADD COLUMN IF NOT EXISTS departmentheadid VARCHAR(191)',
        'ALTER TABLE departments ADD COLUMN IF NOT EXISTS department_head_id VARCHAR(191)',
        'ALTER TABLE departments ADD COLUMN IF NOT EXISTS code VARCHAR(50)',
        'ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT',
        'ALTER TABLE departments ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE departments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        // teaching_departments columns
        'ALTER TABLE teaching_departments ADD COLUMN IF NOT EXISTS "departmentHeadId" VARCHAR(191)',
        'ALTER TABLE teaching_departments ADD COLUMN IF NOT EXISTS departmentheadid VARCHAR(191)',
        'ALTER TABLE teaching_departments ADD COLUMN IF NOT EXISTS department_head_id VARCHAR(191)',
        'ALTER TABLE teaching_departments ADD COLUMN IF NOT EXISTS code VARCHAR(50)',
        'ALTER TABLE teaching_departments ADD COLUMN IF NOT EXISTS description TEXT',
        'ALTER TABLE teaching_departments ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE teaching_departments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',

        // subjects columns
        'ALTER TABLE subjects ADD COLUMN IF NOT EXISTS title VARCHAR(255)',
        'ALTER TABLE subjects ADD COLUMN IF NOT EXISTS name VARCHAR(255)',
        'ALTER TABLE subjects ADD COLUMN IF NOT EXISTS hours_per_week DECIMAL(5, 2) DEFAULT 3.00',
        'ALTER TABLE subjects ADD COLUMN IF NOT EXISTS "departmentId" VARCHAR(191)',
        'ALTER TABLE subjects ADD COLUMN IF NOT EXISTS department_id VARCHAR(191)',
        'ALTER TABLE subjects ADD COLUMN IF NOT EXISTS departmentid VARCHAR(191)',
        'ALTER TABLE subjects ADD COLUMN IF NOT EXISTS "teachingDepartmentId" VARCHAR(191)',
        'ALTER TABLE subjects ADD COLUMN IF NOT EXISTS teaching_department_id VARCHAR(191)',
        'ALTER TABLE subjects ADD COLUMN IF NOT EXISTS teachingdepartmentid VARCHAR(191)',
        'ALTER TABLE subjects ADD COLUMN IF NOT EXISTS units DECIMAL(5, 2) DEFAULT 3.00',
        'ALTER TABLE subjects ADD COLUMN IF NOT EXISTS description TEXT',
        'ALTER TABLE subjects ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE subjects ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP'
      ];

      for (const alt of requiredAlters) {
        try {
          await db.exec(alt);
        } catch {}
      }

      const backfillQueries = [
        'UPDATE schedules SET "dayOfWeek" = COALESCE("dayOfWeek", dayofweek, day_of_week, \'\') WHERE ("dayOfWeek" IS NULL OR "dayOfWeek" = \'\') AND (dayofweek IS NOT NULL OR day_of_week IS NOT NULL)',
        'UPDATE schedules SET dayofweek = COALESCE(dayofweek, "dayOfWeek", day_of_week, \'\') WHERE (dayofweek IS NULL OR dayofweek = \'\') AND ("dayOfWeek" IS NOT NULL OR day_of_week IS NOT NULL)',
        'UPDATE schedules SET "startTime" = COALESCE("startTime", starttime, start_time, \'08:00\') WHERE ("startTime" IS NULL OR "startTime" = \'\')',
        'UPDATE schedules SET "endTime" = COALESCE("endTime", endtime, end_time, \'17:00\') WHERE ("endTime" IS NULL OR "endTime" = \'\')',
        'UPDATE schedules SET "timeIn" = COALESCE("timeIn", timein, time_in, \'08:00\') WHERE ("timeIn" IS NULL OR "timeIn" = \'\')',
        'UPDATE schedules SET "timeOut" = COALESCE("timeOut", timeout, time_out, \'17:00\') WHERE ("timeOut" IS NULL OR "timeOut" = \'\')',
        'UPDATE schedules SET "employeeId" = COALESCE("employeeId", employeeid, employee_id) WHERE "employeeId" IS NULL AND (employeeid IS NOT NULL OR employee_id IS NOT NULL)',
        'UPDATE schedules SET employeeid = COALESCE(employeeid, "employeeId", employee_id) WHERE employeeid IS NULL AND ("employeeId" IS NOT NULL OR employee_id IS NOT NULL)',
        'UPDATE teaching_loads SET "dayOfWeek" = COALESCE("dayOfWeek", dayofweek, day_of_week, \'\') WHERE ("dayOfWeek" IS NULL OR "dayOfWeek" = \'\') AND (dayofweek IS NOT NULL OR day_of_week IS NOT NULL)',
        'UPDATE teaching_loads SET "startTime" = COALESCE("startTime", starttime, start_time, \'08:00\') WHERE ("startTime" IS NULL OR "startTime" = \'\')',
        'UPDATE teaching_loads SET "endTime" = COALESCE("endTime", endtime, end_time, \'17:00\') WHERE ("endTime" IS NULL OR "endTime" = \'\')',
        'UPDATE teaching_loads SET "employeeId" = COALESCE("employeeId", employeeid, employee_id) WHERE "employeeId" IS NULL',
        'UPDATE leave_applications SET "employeeId" = COALESCE("employeeId", employeeid, employee_id) WHERE "employeeId" IS NULL',
        'UPDATE leave_applications SET "leaveType" = COALESCE("leaveType", leavetype, leave_type, \'Vacation\') WHERE "leaveType" IS NULL',
        'UPDATE visiting_instructors SET "hourlyRate" = COALESCE("hourlyRate", hourly_rate, hourlyrate, 350.00) WHERE ("hourlyRate" IS NULL OR "hourlyRate" = 0)',
        'UPDATE visiting_instructors SET hourly_rate = COALESCE(hourly_rate, "hourlyRate", hourlyrate, 350.00) WHERE (hourly_rate IS NULL OR hourly_rate = 0)',
        'UPDATE visiting_instructors SET "employeeId" = COALESCE("employeeId", employeeid, employee_id) WHERE "employeeId" IS NULL',
        'UPDATE visiting_instructors SET "departmentId" = COALESCE("departmentId", departmentid, department_id, \'dept-1\') WHERE "departmentId" IS NULL'
      ];
      for (const q of backfillQueries) {
        try {
          await db.exec(q);
        } catch {}
      }
    } else {
      // MySQL Column Synchronizer: Safely inspect existing columns before adding
      try {
        const dbName = process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE || 'railway';
        const cols = await (mysqlPool as any).query(
          "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?",
          [dbName]
        );
        const existingMap = new Set<string>();
        if (cols && cols[0] && Array.isArray(cols[0])) {
          cols[0].forEach((r: any) => {
            existingMap.add(`${String(r.TABLE_NAME).toLowerCase()}.${String(r.COLUMN_NAME).toLowerCase()}`);
          });
        }

        const mysqlColsToAdd = [
          { table: 'visiting_instructors', col: 'employeeId', def: 'employeeId VARCHAR(191)' },
          { table: 'visiting_instructors', col: 'hourlyRate', def: 'hourlyRate DECIMAL(15, 2) DEFAULT 350.00' },
          { table: 'visiting_instructors', col: 'hourly_rate', def: 'hourly_rate DECIMAL(15, 2) DEFAULT 350.00' },
          { table: 'visiting_instructors', col: 'maxHoursPerWeek', def: 'maxHoursPerWeek DECIMAL(5, 2) DEFAULT 40.00' },
          { table: 'visiting_instructors', col: 'departmentId', def: 'departmentId VARCHAR(191)' },
          { table: 'visiting_instructors', col: 'contractStart', def: 'contractStart DATE' },
          { table: 'visiting_instructors', col: 'contractEnd', def: 'contractEnd DATE' },
          { table: 'visiting_instructors', col: 'createdAt', def: 'createdAt DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'visiting_instructors', col: 'created_at', def: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'payroll_cycles', col: 'createdAt', def: 'createdAt DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'payroll_cycles', col: 'created_at', def: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'payroll_cycles', col: 'startDate', def: 'startDate DATE' },
          { table: 'payroll_cycles', col: 'start_date', def: 'start_date DATE' },
          { table: 'payroll_cycles', col: 'endDate', def: 'endDate DATE' },
          { table: 'payroll_cycles', col: 'end_date', def: 'end_date DATE' },
          { table: 'payroll_cycles', col: 'categoryFilter', def: 'categoryFilter VARCHAR(50) DEFAULT "all"' },
          { table: 'payroll_cycles', col: 'category_filter', def: 'category_filter VARCHAR(50) DEFAULT "all"' },
          { table: 'payroll_cycles', col: 'totalGross', def: 'totalGross DECIMAL(15, 2) DEFAULT 0.00' },
          { table: 'payroll_cycles', col: 'totalDeductions', def: 'totalDeductions DECIMAL(15, 2) DEFAULT 0.00' },
          { table: 'payroll_cycles', col: 'totalNet', def: 'totalNet DECIMAL(15, 2) DEFAULT 0.00' },
          { table: 'payroll_cycles', col: 'managedBy', def: 'managedBy VARCHAR(191) DEFAULT "accountant-1"' },
          { table: 'payroll_cycles', col: 'managedByName', def: 'managedByName VARCHAR(255) DEFAULT "System Accountant"' },
          { table: 'payroll_cycles', col: 'campus', def: 'campus VARCHAR(100) DEFAULT "Hinunangan Campus"' },
          { table: 'payroll_cycles', col: 'type', def: 'type VARCHAR(50) DEFAULT "all"' },
          { table: 'payroll_cycles', col: 'status', def: 'status VARCHAR(50) DEFAULT "draft"' },
          { table: 'payroll_cycles', col: 'approvedBy', def: 'approvedBy VARCHAR(191)' },
          { table: 'payroll_cycles', col: 'approvedAt', def: 'approvedAt DATETIME' },

          { table: 'payroll_entries', col: 'createdAt', def: 'createdAt DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'payroll_entries', col: 'created_at', def: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'payroll_entries', col: 'cycleId', def: 'cycleId VARCHAR(191)' },
          { table: 'payroll_entries', col: 'employeeId', def: 'employeeId VARCHAR(191)' },
          { table: 'payroll_entries', col: 'employeeName', def: 'employeeName VARCHAR(255)' },
          { table: 'payroll_entries', col: 'basicPay', def: 'basicPay DECIMAL(15, 2) DEFAULT 0.00' },
          { table: 'payroll_entries', col: 'grossPay', def: 'grossPay DECIMAL(15, 2) DEFAULT 0.00' },
          { table: 'payroll_entries', col: 'totalDeductions', def: 'totalDeductions DECIMAL(15, 2) DEFAULT 0.00' },
          { table: 'payroll_entries', col: 'netPay', def: 'netPay DECIMAL(15, 2) DEFAULT 0.00' },
          { table: 'payroll_entries', col: 'deductions_json', def: 'deductions_json TEXT' },
          { table: 'payroll_entries', col: 'custom_values_json', def: 'custom_values_json TEXT' },

          { table: 'payroll_records', col: 'createdAt', def: 'createdAt DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'payroll_records', col: 'created_at', def: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'audit_logs', col: 'createdAt', def: 'createdAt DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'audit_logs', col: 'created_at', def: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'users', col: 'createdAt', def: 'createdAt DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'users', col: 'created_at', def: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'employees', col: 'createdAt', def: 'createdAt DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'employees', col: 'created_at', def: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },

          { table: 'departments', col: 'departmentHeadId', def: 'departmentHeadId VARCHAR(191)' },
          { table: 'departments', col: 'departmentheadid', def: 'departmentheadid VARCHAR(191)' },
          { table: 'departments', col: 'department_head_id', def: 'department_head_id VARCHAR(191)' },
          { table: 'departments', col: 'code', def: 'code VARCHAR(50)' },
          { table: 'departments', col: 'description', def: 'description TEXT' },
          { table: 'departments', col: 'createdAt', def: 'createdAt DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'departments', col: 'created_at', def: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },

          { table: 'teaching_departments', col: 'departmentHeadId', def: 'departmentHeadId VARCHAR(191)' },
          { table: 'teaching_departments', col: 'code', def: 'code VARCHAR(50)' },
          { table: 'teaching_departments', col: 'description', def: 'description TEXT' },
          { table: 'teaching_departments', col: 'createdAt', def: 'createdAt DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'teaching_departments', col: 'created_at', def: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },

          { table: 'subjects', col: 'departmentId', def: 'departmentId VARCHAR(191)' },
          { table: 'subjects', col: 'department_id', def: 'department_id VARCHAR(191)' },
          { table: 'subjects', col: 'teachingDepartmentId', def: 'teachingDepartmentId VARCHAR(191)' },
          { table: 'subjects', col: 'teaching_department_id', def: 'teaching_department_id VARCHAR(191)' },
          { table: 'subjects', col: 'units', def: 'units DECIMAL(5, 2) DEFAULT 3.00' },
          { table: 'subjects', col: 'description', def: 'description TEXT' },
          { table: 'subjects', col: 'createdAt', def: 'createdAt DATETIME DEFAULT CURRENT_TIMESTAMP' },
          { table: 'subjects', col: 'created_at', def: 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP' }
        ];

        for (const item of mysqlColsToAdd) {
          const key = `${item.table.toLowerCase()}.${item.col.toLowerCase()}`;
          if (!existingMap.has(key)) {
            try {
              await (mysqlPool as any).query(`ALTER TABLE ${item.table} ADD COLUMN ${item.def}`);
            } catch {}
          }
        }
      } catch {}
    }

    // 3. Seed Default Administrator Accounts
    const adminEmails = ["admin@gmail.com", "caturanchristian@gmail.com", "chancaturan@gmail.com"];
    const adminPassword = "admin123";

    for (let idx = 0; idx < adminEmails.length; idx++) {
      const emailAddress = adminEmails[idx];
      const adminId = `admin-${idx + 1}`;
      const existingAdmin = await db.prepare('SELECT * FROM users WHERE id = ? OR LOWER(email) = ?').get(adminId, emailAddress.toLowerCase()) as any;
      if (existingAdmin) {
        await db.prepare('UPDATE users SET role = \'admin\', password = ?, "displayName" = ?, campus = ? WHERE id = ?').run(adminPassword, "Administrator", "Hinunangan Campus", existingAdmin.id);
      } else {
        await db.prepare('INSERT INTO users (id, email, password, "displayName", role, campus) VALUES (?, ?, ?, ?, ?, ?)').run(adminId, emailAddress.toLowerCase(), adminPassword, "Administrator", "admin", "Hinunangan Campus");
      }
    }

    // 4. Seed Accountants across campuses
    const accountantsSeed = [
      { id: "accountant-1", email: "accountant@example.com", pass: "accountant123", name: "System Accountant", campus: "Hinunangan Campus" },
      { id: "accountant-2", email: "accountant.sogod@slsu.edu.ph", pass: "accountant123", name: "Sogod Campus Accountant", campus: "Sogod (Main) Campus" },
      { id: "accountant-3", email: "accountant.tomas@slsu.edu.ph", pass: "accountant123", name: "Tomas Oppus Accountant", campus: "Tomas Oppus Campus" }
    ];

    for (const acc of accountantsSeed) {
      const existingAcc = await db.prepare('SELECT * FROM users WHERE id = ? OR LOWER(email) = ?').get(acc.id, acc.email.toLowerCase()) as any;
      if (existingAcc) {
        await db.prepare('UPDATE users SET role = \'accountant\', password = ?, "displayName" = ?, campus = ? WHERE id = ?').run(acc.pass, acc.name, acc.campus, existingAcc.id);
      } else {
        await db.prepare('INSERT INTO users (id, email, password, "displayName", role, campus) VALUES (?, ?, ?, ?, ?, ?)').run(acc.id, acc.email.toLowerCase(), acc.pass, acc.name, "accountant", acc.campus);
      }
    }

    // 5. Seed Department Head
    const deptHeadEmail = "head@gmail.com";
    const deptHeadPassword = "head123";
    const existingDeptHead = await db.prepare("SELECT * FROM users WHERE id = 'depthead-1' OR LOWER(email) = ?").get(deptHeadEmail.toLowerCase()) as any;
    if (existingDeptHead) {
      await db.prepare('UPDATE users SET role = \'department_head\', password = ?, "displayName" = ?, campus = ? WHERE id = ?').run(deptHeadPassword, "Department Head", "Hinunangan Campus", existingDeptHead.id);
    } else {
      await db.prepare('INSERT INTO users (id, email, password, "displayName", role, campus) VALUES (?, ?, ?, ?, ?, ?)').run("depthead-1", deptHeadEmail.toLowerCase(), deptHeadPassword, "Department Head", "department_head", "Hinunangan Campus");
    }

    // 6. Seed Sample Departments if none exist
    const deptCount = await db.prepare("SELECT COUNT(*) as count FROM departments").get() as any;
    if (!deptCount || Number(deptCount.count) === 0) {
      await db.prepare("INSERT INTO departments (id, name, code, description, campus) VALUES (?, ?, ?, ?, ?)").run("dept-1", "Information Technology", "IT", "College of Computer Studies", "Hinunangan Campus");
      await db.prepare("INSERT INTO departments (id, name, code, description, campus) VALUES (?, ?, ?, ?, ?)").run("dept-2", "Teacher Education", "TE", "College of Education", "Hinunangan Campus");
      await db.prepare("INSERT INTO departments (id, name, code, description, campus) VALUES (?, ?, ?, ?, ?)").run("dept-3", "Administration & Finance", "ADMIN", "Administrative Support Staff", "Hinunangan Campus");
    }

    // 7. Seed Sample Employees if none exist
    const empCount = await db.prepare("SELECT COUNT(*) as count FROM employees").get() as any;
    if (!empCount || Number(empCount.count) === 0) {
      const sampleEmployees = [
        {
          id: "emp-101",
          employeeId: "SLSU-2024-001",
          firstName: "Juan",
          lastName: "Dela Cruz",
          mi: "M",
          email: "juan.delacruz@slsu.edu.ph",
          password: "password123",
          category: "FACULTY",
          basicSalary: 35000,
          position: "Instructor I",
          gender: "MALE",
          campus: "Hinunangan Campus",
          phoneNumber: "09171234567"
        },
        {
          id: "emp-102",
          employeeId: "SLSU-2024-002",
          firstName: "Maria",
          lastName: "Santos",
          mi: "A",
          email: "maria.santos@slsu.edu.ph",
          password: "password123",
          category: "STAFF",
          basicSalary: 28000,
          position: "Administrative Assistant II",
          gender: "FEMALE",
          campus: "Hinunangan Campus",
          phoneNumber: "09181234567"
        },
        {
          id: "emp-103",
          employeeId: "SLSU-2024-003",
          firstName: "Roberto",
          lastName: "Alcantara",
          mi: "B",
          email: "roberto.alcantara@slsu.edu.ph",
          password: "password123",
          category: "Visiting Instructor",
          basicSalary: 25000,
          position: "Visiting Lecturer",
          gender: "MALE",
          campus: "Hinunangan Campus",
          phoneNumber: "09191234567"
        },
        {
          id: "emp-104",
          employeeId: "SLSU-2024-004",
          firstName: "Elena",
          lastName: "Gomez",
          mi: "C",
          email: "elena.gomez@slsu.edu.ph",
          password: "password123",
          category: "Job Order",
          basicSalary: 18000,
          position: "Support Staff",
          gender: "FEMALE",
          campus: "Sogod (Main) Campus",
          phoneNumber: "09201234567"
        }
      ];

      for (const emp of sampleEmployees) {
        await db.prepare(`
          INSERT INTO employees (
            id, "employeeId", "firstName", "lastName", mi, email, password, category,
            "basicSalary", "salaryType", status, "phoneNumber", "hireDate", "hasSss",
            "hasPhilhealth", "hasPagibig", position, gender, campus
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'monthly', 'active', ?, '2024-01-15', 1, 1, 1, ?, ?, ?)
          ON CONFLICT (id) DO NOTHING
        `).run(
          emp.id, emp.employeeId, emp.firstName, emp.lastName, emp.mi, emp.email,
          emp.password, emp.category, emp.basicSalary, emp.phoneNumber,
          emp.position, emp.gender, emp.campus
        );

        await db.prepare(`
          INSERT INTO users (id, email, password, "displayName", role, campus)
          VALUES (?, ?, ?, ?, 'employee', ?)
          ON CONFLICT (id) DO NOTHING
        `).run(emp.id, emp.email.toLowerCase(), emp.password, `${emp.firstName} ${emp.lastName}`.trim(), emp.campus);
      }
    }

    // 8. Seed Positions if none
    const posCount = await db.prepare("SELECT COUNT(*) as count FROM employee_positions").get() as any;
    if (!posCount || Number(posCount.count) === 0) {
      await db.prepare("INSERT INTO employee_positions (id, name, description) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING").run('pos-1', 'Instructor I', 'Faculty Teaching Rank');
      await db.prepare("INSERT INTO employee_positions (id, name, description) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING").run('pos-2', 'Assistant Professor I', 'Faculty Teaching Rank');
      await db.prepare("INSERT INTO employee_positions (id, name, description) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING").run('pos-3', 'Administrative Assistant II', 'Staff Non-Teaching');
      await db.prepare("INSERT INTO employee_positions (id, name, description) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING").run('pos-4', 'Visiting Lecturer', 'Contractual Teaching Staff');
      await db.prepare("INSERT INTO employee_positions (id, name, description) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING").run('pos-5', 'Support Staff', 'Job Order Personnel');
    }

    // 9. Seed Categories if none
    const catCount = await db.prepare("SELECT COUNT(*) as count FROM employee_categories").get() as any;
    if (!catCount || Number(catCount.count) === 0) {
      await db.prepare("INSERT INTO employee_categories (id, name, description) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING").run('cat-1', 'FACULTY', 'Regular Academic Faculty');
      await db.prepare("INSERT INTO employee_categories (id, name, description) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING").run('cat-2', 'STAFF', 'Administrative & Support Staff');
      await db.prepare("INSERT INTO employee_categories (id, name, description) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING").run('cat-3', 'Visiting Instructor', 'Contract of Service Teaching Personnel');
      await db.prepare("INSERT INTO employee_categories (id, name, description) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING").run('cat-4', 'Job Order', 'General Support and Job Order Workers');
    }

    // 10. Seed Deduction Types if none
    const dtCount = await db.prepare("SELECT COUNT(*) as count FROM deduction_types").get() as any;
    if (!dtCount || Number(dtCount.count) === 0) {
      await db.prepare("INSERT INTO deduction_types (id, name, description) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING").run('dt-1', 'GSIS Policy Loan', 'GSIS Policy Loan Amortization');
      await db.prepare("INSERT INTO deduction_types (id, name, description) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING").run('dt-2', 'HDMF MPL', 'Pag-IBIG Multi-Purpose Loan');
      await db.prepare("INSERT INTO deduction_types (id, name, description) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING").run('dt-3', 'Pag-IBIG MP2', 'Pag-IBIG Voluntary MP2 Savings');
      await db.prepare("INSERT INTO deduction_types (id, name, description) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING").run('dt-4', 'PhilHealth Contribution', 'National Health Insurance');
    }

    // 11. Seed Visiting Instructors if none
    const viCount = await db.prepare("SELECT COUNT(*) as count FROM visiting_instructors").get() as any;
    if (!viCount || Number(viCount.count) === 0) {
      const visitingEmps = await db.prepare("SELECT id FROM employees WHERE category = 'Visiting Instructor'").all() as any[];
      for (const ve of visitingEmps) {
        try {
          await db.prepare(`
            INSERT INTO visiting_instructors (id, "employeeId", "hourlyRate", "departmentId")
            VALUES (?, ?, 350.00, 'dept-1')
            ON CONFLICT (id) DO NOTHING
          `).run(`vi-${ve.id}`, ve.id);
        } catch {
          try {
            await db.prepare(`
              INSERT INTO visiting_instructors (id, employee_id, hourly_rate, department_id)
              VALUES (?, ?, 350.00, 'dept-1')
              ON CONFLICT (id) DO NOTHING
            `).run(`vi-${ve.id}`, ve.id);
          } catch {}
        }
      }
    }

    // 12. Seed Teaching Departments if none
    const tdCount = await db.prepare("SELECT COUNT(*) as count FROM teaching_departments").get() as any;
    if (!tdCount || Number(tdCount.count) === 0) {
      await db.prepare("INSERT INTO teaching_departments (id, name, code, description) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING").run('td-1', 'College of Computer Studies', 'CCS', 'Department of Computer Studies & Information Technology');
      await db.prepare("INSERT INTO teaching_departments (id, name, code, description) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING").run('td-2', 'College of Teacher Education', 'CTE', 'Department of Teacher Education');
      await db.prepare("INSERT INTO teaching_departments (id, name, code, description) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING").run('td-3', 'College of Engineering & Technology', 'CET', 'Department of Engineering and Applied Sciences');
      await db.prepare("INSERT INTO teaching_departments (id, name, code, description) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING").run('td-4', 'College of Arts and Sciences', 'CAS', 'Department of General Education and Sciences');
    }

    // 13. Seed Subjects if none
    const subCount = await db.prepare("SELECT COUNT(*) as count FROM subjects").get() as any;
    if (!subCount || Number(subCount.count) === 0) {
      await db.prepare("INSERT INTO subjects (id, code, title, units, \"teachingDepartmentId\", description) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING").run('sub-1', 'IT 101', 'Introduction to Computing', 3, 'td-1', 'Basic concepts of Information Technology and computer systems');
      await db.prepare("INSERT INTO subjects (id, code, title, units, \"teachingDepartmentId\", description) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING").run('sub-2', 'IT 102', 'Computer Programming 1', 3, 'td-1', 'Fundamental programming algorithms and problem solving');
      await db.prepare("INSERT INTO subjects (id, code, title, units, \"teachingDepartmentId\", description) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING").run('sub-3', 'IT 201', 'Data Structures & Algorithms', 3, 'td-1', 'Core computer science data structures and sorting techniques');
      await db.prepare("INSERT INTO subjects (id, code, title, units, \"teachingDepartmentId\", description) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING").run('sub-4', 'ED 101', 'The Teaching Profession', 3, 'td-2', 'Foundations and ethical principles of professional teaching');
      await db.prepare("INSERT INTO subjects (id, code, title, units, \"teachingDepartmentId\", description) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING").run('sub-5', 'GE 101', 'Understanding the Self', 3, 'td-4', 'General Education social sciences curriculum');
    }

    // 14. Seed Holidays if none
    const holCount = await db.prepare("SELECT COUNT(*) as count FROM holidays").get() as any;
    if (!holCount || Number(holCount.count) === 0) {
      const defaultHolidays = [
        { id: 'hol-1', name: "New Year's Day", date: '2025-01-01', type: 'Regular' },
        { id: 'hol-2', name: "Araw ng Kagitingan", date: '2025-04-09', type: 'Regular' },
        { id: 'hol-3', name: "Maundy Thursday", date: '2025-04-17', type: 'Regular' },
        { id: 'hol-4', name: "Good Friday", date: '2025-04-18', type: 'Regular' },
        { id: 'hol-5', name: "Labor Day", date: '2025-05-01', type: 'Regular' },
        { id: 'hol-6', name: "Independence Day", date: '2025-06-12', type: 'Regular' },
        { id: 'hol-7', name: "National Heroes Day", date: '2025-08-25', type: 'Regular' },
        { id: 'hol-8', name: "All Saints' Day", date: '2025-11-01', type: 'Special Non-Working' },
        { id: 'hol-9', name: "Bonifacio Day", date: '2025-11-30', type: 'Regular' },
        { id: 'hol-10', name: "Feast of the Immaculate Conception", date: '2025-12-08', type: 'Special Non-Working' },
        { id: 'hol-11', name: "Christmas Day", date: '2025-12-25', type: 'Regular' },
        { id: 'hol-12', name: "Rizal Day", date: '2025-12-30', type: 'Regular' },
        { id: 'hol-13', name: "New Year's Day", date: '2026-01-01', type: 'Regular' },
        { id: 'hol-14', name: "Labor Day", date: '2026-05-01', type: 'Regular' },
        { id: 'hol-15', name: "Independence Day", date: '2026-06-12', type: 'Regular' },
        { id: 'hol-16', name: "Christmas Day", date: '2026-12-25', type: 'Regular' },
        { id: 'hol-17', name: "Rizal Day", date: '2026-12-30', type: 'Regular' }
      ];
      for (const h of defaultHolidays) {
        await db.prepare("INSERT INTO holidays (id, name, date, type) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING").run(h.id, h.name, h.date, h.type);
      }
    }

    // 15. Seed Payroll Settings if none
    const settsCount = await db.prepare("SELECT COUNT(*) as count FROM payroll_settings").get() as any;
    if (!settsCount || Number(settsCount.count) === 0) {
      const defaultSettings = [
        { id: 'set-1', key: 'standard_hours_per_day', value: '8', description: 'Standard working hours per day' },
        { id: 'set-2', key: 'cutoff_days', value: '15,30', description: 'Semi-monthly payroll cut-off days' },
        { id: 'set-3', key: 'gsis_personal_rate', value: '0.09', description: 'GSIS Personal Contribution Rate (9%)' },
        { id: 'set-4', key: 'gsis_government_rate', value: '0.12', description: 'GSIS Government Share Rate (12%)' },
        { id: 'set-5', key: 'philhealth_rate', value: '0.05', description: 'PhilHealth Total Contribution Rate (5%)' },
        { id: 'set-6', key: 'pagibig_personal_share', value: '200.00', description: 'Pag-IBIG Monthly Personal Share' },
        { id: 'set-7', key: 'default_pera_allowance', value: '2000.00', description: 'Personnel Economic Relief Allowance (PERA)' }
      ];
      for (const s of defaultSettings) {
        await db.prepare('INSERT INTO payroll_settings (id, "key", value, description) VALUES (?, ?, ?, ?) ON CONFLICT ("key") DO NOTHING').run(s.id, s.key, s.value, s.description);
      }
    }

    // 16. Seed Compensation Plans if none
    const cpCount = await db.prepare("SELECT COUNT(*) as count FROM compensation_plans").get() as any;
    if (!cpCount || Number(cpCount.count) === 0) {
      await db.prepare(`
        INSERT INTO compensation_plans (id, name, category, "baseRate", "peraAmount", "hazardPay", description, status)
        VALUES 
          ('cp-1', 'Faculty Standard Grade 12', 'FACULTY', 35000.00, 2000.00, 0.00, 'Regular Faculty Instructor Monthly Compensation', 'active'),
          ('cp-2', 'Staff Standard Grade 8', 'STAFF', 28000.00, 2000.00, 0.00, 'Administrative Assistant Regular Compensation', 'active'),
          ('cp-3', 'Visiting Instructor Standard', 'Visiting Instructor', 350.00, 0.00, 0.00, 'Hourly Contract of Service Teaching Compensation', 'active'),
          ('cp-4', 'Job Order Regular Support', 'Job Order', 18000.00, 0.00, 0.00, 'Monthly Job Order Support Personnel Rate', 'active')
        ON CONFLICT (id) DO NOTHING
      `).run();
    }

    // 17. Seed initial active deductions if none
    const activeDedCount = await db.prepare("SELECT COUNT(*) as count FROM deductions").get() as any;
    if (!activeDedCount || Number(activeDedCount.count) === 0) {
      const emp101 = await db.prepare("SELECT id FROM employees WHERE id = 'emp-101'").get();
      const emp102 = await db.prepare("SELECT id FROM employees WHERE id = 'emp-102'").get();
      if (emp101) {
        await db.prepare(`
          INSERT INTO deductions (id, "employeeId", type, description, amount, status)
          VALUES 
            ('ded-1', 'emp-101', 'GSIS Policy Loan', 'GSIS Monthly Policy Loan', 1500.00, 'active'),
            ('ded-2', 'emp-101', 'HDMF MPL', 'Pag-IBIG Multi-Purpose Loan', 1000.00, 'active')
          ON CONFLICT (id) DO NOTHING
        `).run();
      }
      if (emp102) {
        await db.prepare(`
          INSERT INTO deductions (id, "employeeId", type, description, amount, status)
          VALUES 
            ('ded-3', 'emp-102', 'Pag-IBIG MP2', 'Voluntary Savings MP2', 500.00, 'active')
          ON CONFLICT (id) DO NOTHING
        `).run();
      }
    }

    // 18. Seed default schedules for employees if none exist
    const schedCount = await db.prepare("SELECT COUNT(*) as count FROM schedules").get() as any;
    if (!schedCount || Number(schedCount.count) === 0) {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      for (const emp of ['emp-101', 'emp-102', 'emp-104']) {
        const empExists = await db.prepare("SELECT id FROM employees WHERE id = ?").get(emp);
        if (empExists) {
          for (const d of days) {
            await db.prepare(`
              INSERT INTO schedules (id, "employeeId", "dayOfWeek", "startTime", "endTime", "timeIn", "timeOut", subject, room)
              VALUES (?, ?, ?, '08:00', '17:00', '08:00', '17:00', 'Core Working Hours', 'Office')
              ON CONFLICT (id) DO NOTHING
            `).run(`sched-${emp}-${d}`, emp, d);
          }
        }
      }
    }

    console.log(`[Database] All ${TABLE_NAMES.length} tables verified and seeded successfully.`);

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
 * Generates clean, ready-to-run MySQL SQL Dump
 */
export async function generateMysqlDump(includeData = true): Promise<string> {
  const timestamp = new Date().toISOString();
  let dump = `-- ========================================================\n`;
  dump += `-- Southern Leyte State University (SLSU) Payroll System\n`;
  dump += `-- Complete MySQL Schema & Data Export\n`;
  dump += `-- Generated at: ${timestamp}\n`;
  dump += `-- Compatible with: MySQL 8.0+\n`;
  dump += `-- ========================================================\n\n`;

  for (let i = 0; i < TABLE_NAMES.length; i++) {
    const tableName = TABLE_NAMES[i];
    const ddl = SCHEMA_TABLES[i];

    dump += `-- --------------------------------------------------------\n`;
    dump += `-- Table structure for \`${tableName}\`\n`;
    dump += `-- --------------------------------------------------------\n`;
    dump += `${translateMysqlSql(ddl)};\n\n`;

    if (includeData) {
      try {
        const rows = await db.prepare(`SELECT * FROM ${tableName}`).all() as any[];
        if (rows && rows.length > 0) {
          dump += `-- Dumping data for table \`${tableName}\` (${rows.length} rows)\n`;
          const cols = Object.keys(rows[0]);
          const colList = cols.map(c => `\`${c}\``).join(", ");

          for (const row of rows) {
            const vals = cols.map(c => {
              const val = row[c];
              if (val === null || val === undefined) return "NULL";
              if (typeof val === "number") return val;
              if (typeof val === "boolean") return val ? "1" : "0";
              const str = String(val).replace(/'/g, "''").replace(/\\/g, "\\\\");
              return `'${str}'`;
            }).join(", ");

            dump += `REPLACE INTO \`${tableName}\` (${colList}) VALUES (${vals});\n`;
          }
          dump += `\n`;
        }
      } catch (e: any) {
        dump += `-- Note: could not dump rows for ${tableName}: ${e.message}\n\n`;
      }
    }
  }

  dump += `-- MySQL Dump completed at ${new Date().toISOString()}\n`;
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

  let engineName = isMysql ? "mysql" : (isPostgres ? "postgres" : "sqlite");
  let hostName = "Cloud Database";
  let portNum = isMysql ? 3306 : 5432;
  let dbName = "payroll";

  try {
    if (rawDatabaseUrl) {
      const u = new URL(rawDatabaseUrl);
      hostName = u.hostname;
      portNum = Number(u.port || (isMysql ? 3306 : 5432));
      dbName = u.pathname.replace(/^\//, "") || (isMysql ? "payroll" : "postgres");
    }
  } catch {}

  return {
    engine: engineName,
    isPostgresActive: isPostgres,
    isMysqlActive: isMysql,
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
 * Compatibility helper for testing MySQL connection
 */
export async function testMysqlConnection(config?: any) {
  try {
    if (config?.host || config?.uri) {
      const conn = await mysql.createConnection(config.uri || {
        host: config.host,
        port: Number(config.port) || 3306,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: { rejectUnauthorized: false },
      });
      const [res]: any = await conn.query("SELECT VERSION() as version");
      await conn.end();
      return {
        success: true,
        message: "Successfully connected to MySQL database!",
        version: res[0]?.version || "MySQL 8.0",
        connectedAt: new Date().toISOString(),
      };
    } else {
      const pool = getMysqlPool();
      const [res]: any = await pool.query("SELECT VERSION() as version");
      return {
        success: true,
        message: "Successfully connected to MySQL database!",
        version: res[0]?.version || "MySQL 8.0",
        connectedAt: new Date().toISOString(),
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      connectedAt: new Date().toISOString(),
    };
  }
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
