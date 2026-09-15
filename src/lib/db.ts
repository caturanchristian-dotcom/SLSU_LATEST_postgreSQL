import { AsyncLocalStorage } from "async_hooks";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import mysql from "mysql2/promise";

dotenv.config();

// Disable SSL rejection globally for all connections to handle self-signed certificates in Cloud Run
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Storage to track active MySQL connection during a transaction
const mysqlTransactionStorage = new AsyncLocalStorage<mysql.PoolConnection>();

// Flag to denote if MySQL is active
export let isMysql = false;

// MySQL connection Pool
let mysqlPool: mysql.Pool | null = null;

// SQLite database instance
let sqliteDb: any = null;

// Connection variables
const rawUrl = process.env.DATABASE_URL || "";
const isUrlMysql = rawUrl.startsWith("mysql://") || rawUrl.startsWith("mysqls://");

// MySQL Connection configuration
const mysqlUrl = isUrlMysql ? rawUrl : (process.env.MYSQL_URL || "");
const mysqlHost = process.env.MYSQL_HOST || process.env.DB_HOST || "";
const mysqlUser = process.env.MYSQL_USER || process.env.DB_USER || "";
const mysqlPassword = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || "";
const mysqlDatabaseName = process.env.MYSQL_DATABASE || process.env.DB_DATABASE || process.env.DB_NAME || "";
const mysqlPort = Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306);

const hasMysqlConfig = !!(mysqlUrl || mysqlHost);

export function getMysqlPool(): mysql.Pool {
  if (!mysqlPool) {
    if (mysqlUrl) {
      mysqlPool = mysql.createPool({
        uri: mysqlUrl,
        connectionLimit: 10,
        idleTimeout: 30000,
        connectTimeout: 5000,
      });
    } else {
      mysqlPool = mysql.createPool({
        host: mysqlHost,
        user: mysqlUser,
        password: mysqlPassword,
        database: mysqlDatabaseName,
        port: mysqlPort,
        connectionLimit: 10,
        idleTimeout: 30000,
        connectTimeout: 5000,
      });
    }
  }
  return mysqlPool;
}

// Centralizer for SQLite/MySQL translation rules
function translateSql(sql: string): string {
  let finalSql = sql;
  
  if (isMysql) {
    // Translate SQLite-specific PRAGMA queries to MySQL INFORMATION_SCHEMA
    if (/PRAGMA\s+table_info\s*\(\s*(\w+)\s*\)/i.test(finalSql)) {
      const match = finalSql.match(/PRAGMA\s+table_info\s*\(\s*(\w+)\s*\)/i);
      const tableName = match ? match[1] : "";
      if (tableName) {
        finalSql = `
          SELECT COLUMN_NAME as name, DATA_TYPE as type 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = '${tableName}' AND TABLE_SCHEMA = DATABASE()
        `;
      }
    } else if (/PRAGMA\s+foreign_key_list\s*\(\s*(\w+)\s*\)/i.test(finalSql)) {
      const match = finalSql.match(/PRAGMA\s+foreign_key_list\s*\(\s*(\w+)\s*\)/i);
      const tableName = match ? match[1] : "";
      if (tableName) {
        finalSql = `
          SELECT 
            REFERENCED_TABLE_NAME AS \`table\`,
            REFERENCED_COLUMN_NAME AS \`to\`
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
          WHERE TABLE_NAME = '${tableName}' AND TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
        `;
      }
    }

    // Convert SQLite INSERT OR IGNORE and INSERT OR REPLACE for MySQL
    finalSql = finalSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT IGNORE INTO")
                       .replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "REPLACE INTO")
                       .replace(/INSERT\s+OR\s+IGNORE/gi, "INSERT IGNORE");
    return finalSql;
  }
  
  return finalSql;
}

// Casing map for translating PostgreSQL lowercase columns back to React camelCase keys
const keyCasingMap: Record<string, string> = {
  firstname: "firstName",
  lastname: "lastName",
  displayname: "displayName",
  employeeid: "employeeId",
  basicsalary: "basicSalary",
  salarytype: "salaryType",
  phonenumber: "phoneNumber",
  hiredate: "hireDate",
  hassss: "hasSss",
  hasphilhealth: "hasPhilhealth",
  haspagibig: "hasPagibig",
  birthdate: "birthDate",
  effectivitydate: "effectivityDate",
  profileimage: "profileImage",
  createdat: "createdAt",
  startdate: "startDate",
  enddate: "endDate",
  categoryfilter: "categoryFilter",
  totalgross: "totalGross",
  totaldeductions: "totalDeductions",
  totalnet: "totalNet",
  totalemployees: "totalEmployees",
  monthname: "monthName",
  periodtype: "periodType",
  recorddatajson: "recordDataJson",
  createdby: "createdBy",
  updatedat: "updatedAt",
  cycleid: "cycleId",
  employeename: "employeeName",
  basicpay: "basicPay",
  othours: "otHours",
  teachinghours: "teachingHours",
  grosspay: "grossPay",
  netpay: "netPay",
  isvalidated: "isValidated",
  govsecgsis: "govSecGsis",
  govsechdmf: "govSecHdmf",
  govsecph: "govSecPh",
  govsececip: "govSecEcip",
  compsal2nd: "compSal2nd",
  comppera: "compPera",
  compgross: "compGross",
  dedpolicyloan: "dedPolicyLoan",
  dedconsolloan: "dedConsolLoan",
  dedmpllite: "dedMplLite",
  dedmpl: "dedMpl",
  dedcpl: "dedCpl",
  dedgfal: "dedGfal",
  dedemergencyloan: "dedEmergencyLoan",
  dedgsisprempersonal: "dedGsisPremPersonal",
  dededucasst: "dedEducAsst",
  dedpagibigpersonal: "dedPagibigPersonal",
  dedpagibigmpl: "dedPagibigMpl",
  dedsss: "dedSss",
  dedpagibigmp2: "dedPagibigMp2",
  dedphilhealthcont: "dedPhilhealthCont",
  dedcsbloan: "dedCsbLoan",
  dedtaxwithheld: "dedTaxWithheld",
  userid: "userId",
  useremail: "userEmail",
  ipaddress: "ipAddress",
  dayofweek: "dayOfWeek",
  starttime: "startTime",
  endtime: "endTime",
  specificdate: "specificDate",
  effectivefrom: "effectiveFrom",
  effectiveto: "effectiveTo",
  timein: "timeIn",
  timeout: "timeOut",
  employeeno: "employeeNo",
  friendlyemployeeid: "friendlyEmployeeId",
  departmentid: "departmentId",
  department_id: "departmentId",
  departmentheadid: "departmentHeadId",
  department_head_id: "departmentHeadId",
  teachingdepartmentid: "teachingDepartmentId",
  teaching_department_id: "teachingDepartmentId",
  headname: "headName",
  head_name: "headName",
  heademail: "headEmail",
  head_email: "headEmail",
  column_name: "name", // standard SQLite PRAGMA table_info translation key mapping
  data_type: "type",
};

// Map lowercase returned object keys back to CamelCase keys expected by server.ts and components
function mapRowKeys(row: any) {
  if (!row) return row;
  const mapped: any = {};
  for (const key of Object.keys(row)) {
    const lowerKey = key.toLowerCase();
    const mappedKey = keyCasingMap[lowerKey] || key;
    mapped[mappedKey] = row[key];
  }
  return mapped;
}

// Execute queries robustly for MySQL
async function executeMysqlQuery(sql: string, params: any[], type: "run" | "get" | "all") {
  const finalSql = translateSql(sql);
  const pool = getMysqlPool();
  const connection = mysqlTransactionStorage.getStore() || pool;
  
  // Convert undefined to null
  const convertedParams = params.map(p => {
    if (p === undefined) return null;
    return p;
  });

  let attempts = 0;
  const maxAttempts = 3;
  while (attempts < maxAttempts) {
    try {
      const [rows] = await connection.query(finalSql, convertedParams);
      const rowsArray = Array.isArray(rows) ? rows : [rows];
      
      if (type === "run") {
        const result = rows as any;
        return {
          changes: result.affectedRows ?? 0,
          lastInsertRowid: result.insertId ?? null,
        };
      } else if (type === "get") {
        return mapRowKeys(rowsArray[0]);
      } else {
        return rowsArray.map(mapRowKeys);
      }
    } catch (err: any) {
      attempts++;
      const isConnectionError = 
        err.code === "ECONNRESET" || 
        err.code === "PROTOCOL_CONNECTION_LOST" || 
        err.message?.includes("ECONNRESET") || 
        err.message?.includes("connection") || 
        err.message?.includes("lost") ||
        err.message?.includes("closed");
        
      const isDeadlock = 
        err.code === "ER_LOCK_DEADLOCK" || 
        err.errno === 1213 || 
        err.message?.includes("Deadlock found") || 
        err.message?.includes("lock timeout");

      if (attempts < maxAttempts && isConnectionError && !mysqlTransactionStorage.getStore()) {
        console.warn(`MySQL query connection reset detected: ${err.message}. Retrying query execution once...`);
        await new Promise(resolve => setTimeout(resolve, 50));
        continue;
      }
      
      if (attempts < maxAttempts && isDeadlock && !mysqlTransactionStorage.getStore()) {
        console.warn(`MySQL query deadlock or lock timeout detected. Retrying single query (attempt ${attempts}/${maxAttempts})... Error: ${err.message}`);
        const delay = Math.floor(Math.random() * 100) + 50;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      console.error("MySQL query error:", err.message, "SQL:", finalSql);
      throw err;
    }
  }
}

// Expose same interface as SQLite/MySQL but fully async-ready
class PreparedStatement {
  constructor(private sql: string) {}

  async run(...params: any[]) {
    const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    return await executeMysqlQuery(this.sql, flattened, "run");
  }

  async get(...params: any[]) {
    const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    return await executeMysqlQuery(this.sql, flattened, "get");
  }

  async all(...params: any[]) {
    const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    return await executeMysqlQuery(this.sql, flattened, "all");
  }
}

// SQLite wrapper matching the exact same async signatures as PreparedStatement
class SQLitePreparedStatement {
  constructor(private stmt: any) {}

  async run(...params: any[]) {
    const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const cleanParams = flattened.map(p => p === undefined ? null : p);
    return this.stmt.run(...cleanParams);
  }

  async get(...params: any[]) {
    const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const cleanParams = flattened.map(p => p === undefined ? null : p);
    return this.stmt.get(...cleanParams);
  }

  async all(...params: any[]) {
    const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const cleanParams = flattened.map(p => p === undefined ? null : p);
    return this.stmt.all(...cleanParams);
  }
}

export const db: any = {
  prepare(sql: string) {
    if (isMysql) {
      return new PreparedStatement(sql);
    } else {
      const stmt = sqliteDb.prepare(sql);
      return new SQLitePreparedStatement(stmt);
    }
  },

  async exec(sql: string) {
    if (isMysql) {
      const trimmed = sql.trim().toUpperCase();
      if (trimmed.startsWith("PRAGMA")) {
        return;
      }
      
      const pool = getMysqlPool();
      const connection = mysqlTransactionStorage.getStore() || pool;
      
      let execAttempts = 0;
      while (execAttempts < 2) {
        try {
          const statements = sql
            .split(";")
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.toUpperCase().startsWith("PRAGMA") && !s.toUpperCase().startsWith("USE "));
            
          for (const statement of statements) {
            const finalStatement = translateSql(statement);
            await connection.query(finalStatement);
          }
          break; // success
        } catch (err: any) {
          execAttempts++;
          const isConnectionError = 
            err.code === "ECONNRESET" || 
            err.code === "PROTOCOL_CONNECTION_LOST" || 
            err.message?.includes("ECONNRESET") || 
            err.message?.includes("connection") || 
            err.message?.includes("lost");
            
          if (execAttempts < 2 && isConnectionError && !mysqlTransactionStorage.getStore()) {
            console.warn(`MySQL exec connection reset detected: ${err.message}. Retrying query execution once...`);
            await new Promise(resolve => setTimeout(resolve, 50));
            continue;
          }
          console.error("MySQL exec error:", err.message);
          throw err;
        }
      }
    } else {
      sqliteDb.exec(sql);
    }
  },

  async pragma(arg: string) {
    if (isMysql) {
      return;
    } else {
      return sqliteDb.pragma(arg);
    }
  },

  transaction(fn: any) {
    if (isMysql) {
      return async (...args: any[]) => {
        const pool = getMysqlPool();
        let attempts = 0;
        const maxAttempts = 5;
        while (attempts < maxAttempts) {
          const connection = await pool.getConnection();
          try {
            await connection.query("START TRANSACTION");
            const result = await mysqlTransactionStorage.run(connection, async () => {
              return await fn(...args);
            });
            await connection.query("COMMIT");
            return result;
          } catch (err: any) {
            try {
              await connection.query("ROLLBACK");
            } catch (rollbackErr) {
              // ignore rollback error if connection was closed or inactive
            }
            attempts++;
            const isDeadlock = 
              err.code === "ER_LOCK_DEADLOCK" || 
              err.errno === 1213 || 
              err.message?.includes("Deadlock found") || 
              err.message?.includes("lock timeout");
            
            if (isDeadlock && attempts < maxAttempts) {
              console.warn(`MySQL deadlock or lock timeout detected. Retrying transaction (attempt ${attempts}/${maxAttempts})... Error: ${err.message}`);
              connection.release();
              const delay = Math.floor(Math.random() * 150) + 50 * attempts;
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            console.error("MySQL Transaction Rollback:", err);
            throw err;
          } finally {
            connection.release();
          }
        }
      };
    } else {
      return async (...args: any[]) => {
        sqliteDb.prepare("BEGIN").run();
        try {
          const result = await fn(...args);
          sqliteDb.prepare("COMMIT").run();
          return result;
        } catch (err) {
          try {
            sqliteDb.prepare("ROLLBACK").run();
          } catch (rollbackErr) {
            // ignore rollback error if transaction was already aborted or not started
          }
          throw err;
        }
      };
    }
  },
};

// Verify database connection and set flags
async function verifyDatabase() {
  if (hasMysqlConfig) {
    try {
      console.log("MySQL config detected. Verifying connectivity to MySQL (timeout 5s)...");
      const tempPool = mysqlUrl 
        ? mysql.createPool({ uri: mysqlUrl, connectionLimit: 1, connectTimeout: 5000 })
        : mysql.createPool({
            host: mysqlHost,
            user: mysqlUser,
            password: mysqlPassword,
            database: mysqlDatabaseName,
            port: mysqlPort,
            connectionLimit: 1,
            connectTimeout: 5000,
          });
      
      const connection = await tempPool.getConnection();
      try {
        await connection.query("SELECT 1");
        console.log("MySQL connectivity verified! Utilizing MySQL database.");
        isMysql = true;
        return;
      } finally {
        connection.release();
        await tempPool.end();
      }
    } catch (err: any) {
      console.warn("\n=================== MYSQL CONNECTION ERROR ===================");
      console.warn("MySQL connection verification failed:", err.message);
      console.warn("\nTROUBLESHOOTING TIPS FOR MYSQL:");
      console.warn("1. If using XAMPP/WAMP local MySQL:");
      console.warn("   - Make sure your MySQL module is started in the XAMPP Control Panel.");
      console.warn("   - Verify that MySQL is running on port 3306 (or check if port is different).");
      console.warn("2. Check your .env file parameters:");
      console.warn(`   - DATABASE_URL: ${mysqlUrl ? "Configured (masked)" : "Not set"}`);
      console.warn(`   - host: ${mysqlHost || "Not set"}`);
      console.warn(`   - user: ${mysqlUser || "Not set"}`);
      console.warn(`   - database: ${mysqlDatabaseName || "Not set"}`);
      console.warn(`   - port: ${mysqlPort}`);
      console.warn("==============================================================\n");
    }
  }

  console.log("No remote database verified. Defaulting to SQLite database.");
  isMysql = false;
}

// SQLite database initialization helper
function initSqliteDatabase() {
  // Check if we can open payroll_corrupted.db
  try {
    sqliteDb = new Database("payroll_corrupted.db");
    // test query to see if it's readable
    sqliteDb.prepare("SELECT name FROM sqlite_master LIMIT 1").get();
    console.log("Successfully connected to existing sqlite database: payroll_corrupted.db");
  } catch (err: any) {
    console.warn("Could not load payroll_corrupted.db (might be corrupted or missing):", err.message);
    console.log("Initializing a clean local SQLite database: payroll.db");
    sqliteDb = new Database("payroll.db");
  }

  try {
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('synchronous = NORMAL');
  } catch (pErr) {
    console.warn("Could not set SQLite WAL mode:", pErr);
  }

  const tableExists = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employees'").get();
  if (!tableExists) {
    console.log("Initializing SQLite schema from schema.sql...");
    const schemaPath = path.resolve(process.cwd(), "schema.sql");
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, "utf-8");
      const statements = schemaSql
        .split(";")
        .map(s => {
          const cleanedLines = s.split("\n").filter(line => {
            const trimmedLine = line.trim();
            return trimmedLine.length > 0 && !trimmedLine.startsWith("--") && !trimmedLine.startsWith("/*");
          });
          return cleanedLines.join("\n").trim();
        })
        .filter(stmt => {
          const up = stmt.toUpperCase();
          return stmt.length > 0 && !up.startsWith("CREATE DATABASE") && !up.startsWith("USE ");
        });

      for (const statement of statements) {
        try {
          sqliteDb.exec(statement);
        } catch (err: any) {
          console.warn(`SQLite statement warning: ${err.message} on statement: \n${statement}`);
        }
      }
      console.log("SQLite schema setup successful!");
    }
  }
}

// Auto-run verification and schema setup at startup
try {
  await verifyDatabase();
  
  if (isMysql) {
    const schemaPath = path.resolve(process.cwd(), "schema.sql");
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, "utf-8");
      console.log("Loading MySQL schema from schema.sql...");
      const pool = getMysqlPool();
      
      try {
        const statements = schemaSql
          .split(";")
          .map(s => {
            const cleanedLines = s.split("\n").filter(line => {
              const trimmedLine = line.trim();
              return trimmedLine.length > 0 && !trimmedLine.startsWith("--") && !trimmedLine.startsWith("/*");
            });
            return cleanedLines.join("\n").trim();
          })
          .filter(stmt => {
            const up = stmt.toUpperCase();
            return stmt.length > 0 && !up.startsWith("CREATE DATABASE") && !up.startsWith("USE ");
          });
          
        console.log(`Executing ${statements.length} statements from schema.sql to initialize MySQL...`);
        for (const statement of statements) {
          try {
            const translated = translateSql(statement);
            await pool.query(translated);
          } catch (stmtErr: any) {
            const sqlUpper = statement.toUpperCase();
            if (!sqlUpper.startsWith("CREATE DATABASE") && !sqlUpper.startsWith("USE")) {
              console.warn(`MySQL Statement warning: ${stmtErr.message} on statement: \n${statement}`);
            }
          }
        }
        console.log("MySQL schema setup successful!");
      } catch (err: any) {
        console.error("Error setting up MySQL schema:", err);
      }
    }
  } else {
    initSqliteDatabase();
  }
} catch (err) {
  console.error("Failed to initialize database during startup:", err);
}
