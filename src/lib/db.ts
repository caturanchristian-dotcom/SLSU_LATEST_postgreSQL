import pg from "pg";
import { toast } from "sonner";

const { Pool } = pg;

// Extract PostgreSQL connection string from environment variables
const rawDatabaseUrl =
  (typeof process !== "undefined" && process.env?.DATABASE_URL) ||
  (typeof process !== "undefined" && process.env?.POSTGRES_URL) ||
  (typeof process !== "undefined" && process.env?.SUPABASE_DB_URL) ||
  "";

export const isPostgresConfigured = Boolean(
  rawDatabaseUrl && (rawDatabaseUrl.startsWith("postgres://") || rawDatabaseUrl.startsWith("postgresql://"))
);

export type DatabaseErrorCategory = "timeout" | "auth" | "connection" | "query" | "unknown";

export interface DatabaseErrorInfo {
  category: DatabaseErrorCategory;
  title: string;
  message: string;
  code?: string;
  detail?: string;
  context?: string;
  originalError: any;
}

/**
 * Parses and categorizes database errors into human-readable details.
 */
export function parseDatabaseError(error: any, context?: string): DatabaseErrorInfo {
  const message = error?.message || String(error || "Unknown database error");
  const code = error?.code ? String(error.code).toUpperCase() : "";
  const lowerMsg = message.toLowerCase();

  // 1. Connection Timeout Detection
  const isTimeout =
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "57P01" || // admin_shutdown
    code === "57P02" || // crash_shutdown
    code === "57P03" || // cannot_connect_now
    code === "08001" || // sqlclient_unable_to_establish_sqlconnection
    code === "08006" || // connection_failure
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("timed out") ||
    lowerMsg.includes("connection terminated unexpectedly") ||
    lowerMsg.includes("query_timeout") ||
    lowerMsg.includes("connection closed");

  if (isTimeout) {
    return {
      category: "timeout",
      title: "Database Connection Timeout",
      message: "The database query or connection timed out. Please check network connectivity or your database server status.",
      code: code || "TIMEOUT",
      detail: message,
      context,
      originalError: error,
    };
  }

  // 2. Authentication & Permission Errors
  const isAuth =
    code === "28P01" || // invalid_password
    code === "28000" || // invalid_authorization_specification
    code === "42501" || // insufficient_privilege
    code === "3D000" || // invalid_catalog_name (database does not exist)
    lowerMsg.includes("password authentication failed") ||
    lowerMsg.includes("authentication failed") ||
    lowerMsg.includes("permission denied") ||
    lowerMsg.includes("access denied") ||
    lowerMsg.includes("role") && lowerMsg.includes("does not exist") ||
    lowerMsg.includes("jwt") ||
    lowerMsg.includes("unauthorized");

  if (isAuth) {
    return {
      category: "auth",
      title: "Database Authentication Failed",
      message: "Authentication failed. Please verify your database username, password, or Supabase credentials.",
      code: code || "AUTH_FAILED",
      detail: message,
      context,
      originalError: error,
    };
  }

  // 3. Network & Host Connection Failure
  const isConnection =
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "08000" ||
    code === "08003" ||
    code === "08004" ||
    code === "08007" ||
    lowerMsg.includes("econnrefused") ||
    lowerMsg.includes("enotfound") ||
    lowerMsg.includes("could not connect to server") ||
    lowerMsg.includes("ssl connection has been closed");

  if (isConnection) {
    return {
      category: "connection",
      title: "Database Connection Error",
      message: "Unable to reach the PostgreSQL / Supabase server. Please verify the host address and SSL settings.",
      code: code || "CONN_ERROR",
      detail: message,
      context,
      originalError: error,
    };
  }

  // 4. Query / Schema Execution Errors
  const isQuery =
    code.startsWith("42") || // syntax_error_or_access_rule_violation
    code.startsWith("23") || // integrity_constraint_violation
    lowerMsg.includes("relation") && lowerMsg.includes("does not exist") ||
    lowerMsg.includes("column") && lowerMsg.includes("does not exist") ||
    lowerMsg.includes("syntax error");

  if (isQuery) {
    return {
      category: "query",
      title: "Database Query Error",
      message: error?.detail || message,
      code: code || "QUERY_ERROR",
      detail: message,
      context,
      originalError: error,
    };
  }

  // Default / Unknown
  return {
    category: "unknown",
    title: "Database Operation Failed",
    message: message || "An unexpected database error occurred.",
    code: code || "DB_ERROR",
    detail: message,
    context,
    originalError: error,
  };
}

/**
 * Global database error handler that logs issues and triggers a user-facing toast notification.
 */
export function handleDatabaseError(
  error: any,
  options?: { showToast?: boolean; context?: string; duration?: number }
): DatabaseErrorInfo {
  const { showToast = true, context, duration = 6000 } = options || {};
  const parsed = parseDatabaseError(error, context);

  // Console logging with context
  console.error(`[Database Error${context ? ` in ${context}` : ""}]:`, {
    category: parsed.category,
    title: parsed.title,
    code: parsed.code,
    detail: parsed.detail,
    error,
  });

  // Display Toast Notification in client environments
  if (showToast && typeof window !== "undefined") {
    try {
      toast.error(parsed.title, {
        description: parsed.message,
        duration,
        id: `db-error-${parsed.category}-${parsed.code || "generic"}`,
      });

      // Broadcast custom event for telemetry or custom modal listeners
      window.dispatchEvent(
        new CustomEvent("database-error", {
          detail: parsed,
        })
      );
    } catch (e) {
      console.warn("Could not display database error toast notification:", e);
    }
  }

  return parsed;
}

let poolInstance: pg.Pool | null = null;

/**
 * Returns a singleton PostgreSQL connection Pool instance.
 * Automatically enables SSL for cloud PostgreSQL providers (Supabase, Neon, AWS RDS, Cloud SQL).
 */
export function getPool(): pg.Pool {
  if (!poolInstance) {
    const isCloudPostgres =
      rawDatabaseUrl.includes("supabase.co") ||
      rawDatabaseUrl.includes("neon.tech") ||
      rawDatabaseUrl.includes("pooler.supabase.com") ||
      rawDatabaseUrl.includes("amazonaws.com") ||
      rawDatabaseUrl.includes("sslmode=require");

    poolInstance = new Pool({
      connectionString: rawDatabaseUrl,
      ssl: isCloudPostgres || process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    poolInstance.on("error", (err: Error) => {
      handleDatabaseError(err, { context: "PostgreSQL Pool Idle Client" });
    });
  }
  return poolInstance;
}

/**
 * Direct access to the PostgreSQL Pool
 */
export const pool = {
  query: (text: string, params?: any[]) => getPool().query(text, params),
  connect: () => getPool().connect(),
  end: () => (poolInstance ? poolInstance.end() : Promise.resolve()),
};

/**
 * Execute a SQL query with parameter binding on the PostgreSQL / Supabase database.
 * Automatically captures timeouts, authentication errors, and displays toast notifications.
 *
 * @param text SQL query text (e.g. 'SELECT * FROM employees WHERE campus = $1')
 * @param params Array of bound parameter values
 * @returns Query result object containing rows and metadata
 */
export async function query<T = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
  try {
    const activePool = getPool();
    return await activePool.query<T>(text, params);
  } catch (error: any) {
    handleDatabaseError(error, { context: `Query: ${text.slice(0, 60)}...` });
    throw error;
  }
}

/**
 * Executes a query and returns the first matching row or null.
 */
export async function queryRow<T = any>(text: string, params?: any[]): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows && result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Executes a query and returns an array of rows.
 */
export async function queryRows<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows || [];
}

/**
 * Executes a transactional callback with automatic BEGIN, COMMIT, and ROLLBACK.
 * Catches connection timeouts and auth issues with notifications.
 */
export async function transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const activePool = getPool();
  let client: pg.PoolClient | null = null;
  try {
    client = await activePool.connect();
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error: any) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error("Failed to rollback transaction:", rollbackErr);
      }
    }
    handleDatabaseError(error, { context: "Transaction Block" });
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Validates the connection to the PostgreSQL / Supabase database.
 * Displays toast notifications upon authentication or timeout failures.
 */
export async function testPostgresConnection(): Promise<{
  success: boolean;
  message: string;
  version?: string;
  connectedAt?: string;
  error?: string;
}> {
  try {
    if (!rawDatabaseUrl) {
      const errInfo = handleDatabaseError(new Error("DATABASE_URL environment variable is not configured."), {
        context: "Connection Test",
      });
      return {
        success: false,
        message: errInfo.message,
        error: "Missing DATABASE_URL in environment",
      };
    }

    const result = await query("SELECT version() as version, NOW() as now");
    const row = result.rows[0];

    if (typeof window !== "undefined") {
      toast.success("Database Connected", {
        description: "Successfully connected to PostgreSQL / Supabase database.",
      });
    }

    return {
      success: true,
      message: "Successfully connected to PostgreSQL database!",
      version: row?.version,
      connectedAt: row?.now?.toString() || new Date().toISOString(),
    };
  } catch (err: any) {
    const parsed = handleDatabaseError(err, { context: "testPostgresConnection" });
    return {
      success: false,
      message: parsed.message,
      error: err.message,
    };
  }
}

export default {
  pool,
  getPool,
  query,
  queryRow,
  queryRows,
  transaction,
  testPostgresConnection,
  handleDatabaseError,
  parseDatabaseError,
  isPostgresConfigured,
};
