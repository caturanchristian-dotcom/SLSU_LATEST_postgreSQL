// ============================================================================
// DATABASE ROUTE HANDLER (Database Management, DDL Schema Export, & Diagnostics)
// ============================================================================
// Import Express Router for modular database API routes
import { Router } from "express";
// Import database helper utilities from schema module
import { db, generatePostgresDump, getDatabaseStatus, testPostgresConnection } from "../db/schema.js";
// Import Supabase client helper and configuration flag
import { getSupabaseClient, hasSupabaseConfig } from "../supabase.js";
// Import Supabase JS Client for ad-hoc credential verification
import { createClient } from "@supabase/supabase-js";
// Import Node-Postgres client for direct TCP connection testing
import pg from "pg";

// Instantiate the Express Router instance for database management endpoints
export const databaseRouter = Router();

// ============================================================================
// 1. DATABASE STATUS & STATS ENDPOINT: /api/database/status
// Returns active engine type (SQLite or PostgreSQL), table row counts, and cloud sync status
// ============================================================================
databaseRouter.get("/database/status", async (req: any, res: any) => {
  try {
    // Retrieve statistical metrics, table record counts, and database dialect details
    const status = await getDatabaseStatus();
    // Check if live Supabase client instance is active
    const supabaseClient = getSupabaseClient();
    // Return unified diagnostics JSON response
    res.json({
      ...status,                                  // Includes table counts, engine, and database path
      hasSupabaseConfig,                          // Boolean indicating if environment credentials exist
      isSupabaseActive: !!supabaseClient,         // Boolean indicating if client is connected and ready
    });
  } catch (err: any) {
    // Return HTTP 500 on failure with error message
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 2. EXPORT POSTGRESQL / SUPABASE DDL SCHEMA: /api/database/postgresql-schema
// Generates standard SQL DDL CREATE TABLE & INDEX statements for Supabase SQL Editor
// ============================================================================
databaseRouter.get("/database/postgresql-schema", async (req: any, res: any) => {
  try {
    // Generate SQL DDL script without INSERT statements (schema only)
    const schemaSql = await generatePostgresDump(false);
    // Set headers to trigger file download in browser
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="slsu_payroll_supabase_postgresql_schema.sql"');
    // Transmit SQL DDL script
    res.send(schemaSql);
  } catch (err: any) {
    // Return HTTP 500 on error
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 3. EXPORT FULL SQL DUMP (SCHEMA + LIVE DATA): /api/database/postgresql-dump
// Generates full SQL script containing tables, constraints, sequences, and data rows
// ============================================================================
databaseRouter.get("/database/postgresql-dump", async (req: any, res: any) => {
  try {
    // Generate full database dump with DDL schema and INSERT statements for all rows
    const dump = await generatePostgresDump(true);
    // Format timestamped filename
    const filename = `slsu_payroll_postgresql_dump_${new Date().toISOString().slice(0, 10)}.sql`;
    // Set HTTP response headers for SQL file download
    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // Send full SQL dump content
    res.send(dump);
  } catch (err: any) {
    // Return HTTP 500 on error
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 4. TEST SUPABASE CONNECTION: /api/database/test-supabase
// Validates connection to a custom or default Supabase instance
// ============================================================================
databaseRouter.post("/database/test-supabase", async (req: any, res: any) => {
  try {
    // Extract optional URL and API key from request body or fallback to environment variables
    const { url, key } = req.body;
    const targetUrl = url || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const targetKey = key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    // Validate that credentials exist
    if (!targetUrl || !targetKey) {
      return res.status(400).json({ success: false, error: "Supabase URL and API Key are required." });
    }

    // Initialize temporary Supabase client with non-persisting session for testing
    const testClient = createClient(targetUrl, targetKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Execute test query on employees table
    const { error } = await testClient.from("employees").select("id").limit(1);

    // Verify error code - if table does not exist yet, endpoint connectivity itself is still valid
    if (error && error.code !== "PGRST116" && !error.message?.includes("relation") && !error.message?.includes("does not exist")) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Return success confirmation with server timestamp
    res.json({
      success: true,
      message: "Successfully connected to Supabase endpoint!",
      url: targetUrl,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    // Catch connection timeouts or invalid DNS errors
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 5. TEST DIRECT POSTGRESQL CONNECTION STRING: /api/database/test-postgresql
// Validates a raw postgres:// URI by executing a test query (SELECT version())
// ============================================================================
databaseRouter.post("/database/test-postgresql", async (req: any, res: any) => {
  let client: pg.Client | null = null;
  try {
    // Extract connection string from payload or environment
    const { connectionString } = req.body;
    const connStr = connectionString || process.env.DATABASE_URL;

    // Validate string parameter
    if (!connStr) {
      return res.status(400).json({ success: false, error: "PostgreSQL connection string is required." });
    }

    // Create a new direct pg.Client with SSL enabled and 5 second connection timeout
    client = new pg.Client({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });

    // Attempt direct TCP connection to PostgreSQL server
    await client.connect();
    // Query database server version string
    const result = await client.query("SELECT version()");
    // Close connection cleanly
    await client.end();

    // Respond with version string confirming live database connection
    res.json({
      success: true,
      message: "Successfully connected to PostgreSQL database!",
      version: result.rows[0]?.version,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    // Ensure client connection is terminated on failure
    if (client) {
      try { await client.end(); } catch {}
    }
    // Return error message and status code 500
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 6. GENERAL SCHEMA SQL ALIAS: /api/database/schema-sql
// Compatibility endpoint returning the PostgreSQL DDL schema definition
// ============================================================================
databaseRouter.get("/database/schema-sql", async (req: any, res: any) => {
  try {
    // Generate PostgreSQL schema DDL script
    const dump = await generatePostgresDump(false);
    // Set attachment headers
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="slsu_payroll_schema.sql"');
    // Transmit SQL file
    res.send(dump);
  } catch (err: any) {
    // Return HTTP 500 on error
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 7. TEST GENERIC DATABASE CONNECTION: /api/database/test-connection
// Evaluates connection parameters passed via JSON body
// ============================================================================
databaseRouter.post("/database/test-connection", async (req: any, res: any) => {
  try {
    // Delegate test to schema test helper function
    const result = await testPostgresConnection(req.body);
    // Return test results object
    res.json(result);
  } catch (err: any) {
    // Return error response
    res.status(500).json({ success: false, error: err.message });
  }
});

