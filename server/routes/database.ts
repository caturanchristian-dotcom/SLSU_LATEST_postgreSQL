import { Router } from "express";
import { db, generatePostgresDump, getDatabaseStatus, testPostgresConnection } from "../db/schema.js";
import { getSupabaseClient, hasSupabaseConfig } from "../supabase.js";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

export const databaseRouter = Router();

// GET database connection status and statistics
databaseRouter.get("/database/status", async (req: any, res: any) => {
  try {
    const status = await getDatabaseStatus();
    const supabaseClient = getSupabaseClient();
    res.json({
      ...status,
      hasSupabaseConfig,
      isSupabaseActive: !!supabaseClient,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET Supabase / PostgreSQL Schema SQL DDL script
databaseRouter.get("/database/postgresql-schema", async (req: any, res: any) => {
  try {
    const schemaSql = await generatePostgresDump(false);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="slsu_payroll_supabase_postgresql_schema.sql"');
    res.send(schemaSql);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET Supabase / PostgreSQL Full Dump (Schema + Live Data)
databaseRouter.get("/database/postgresql-dump", async (req: any, res: any) => {
  try {
    const dump = await generatePostgresDump(true);
    const filename = `slsu_payroll_postgresql_dump_${new Date().toISOString().slice(0, 10)}.sql`;
    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(dump);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST test Supabase Connection
databaseRouter.post("/database/test-supabase", async (req: any, res: any) => {
  try {
    const { url, key } = req.body;
    const targetUrl = url || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const targetKey = key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!targetUrl || !targetKey) {
      return res.status(400).json({ success: false, error: "Supabase URL and API Key are required." });
    }

    const testClient = createClient(targetUrl, targetKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { error } = await testClient.from("employees").select("id").limit(1);

    if (error && error.code !== "PGRST116" && !error.message?.includes("relation") && !error.message?.includes("does not exist")) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      message: "Successfully connected to Supabase endpoint!",
      url: targetUrl,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST test PostgreSQL Direct Connection String
databaseRouter.post("/database/test-postgresql", async (req: any, res: any) => {
  let client: pg.Client | null = null;
  try {
    const { connectionString } = req.body;
    const connStr = connectionString || process.env.DATABASE_URL;

    if (!connStr) {
      return res.status(400).json({ success: false, error: "PostgreSQL connection string is required." });
    }

    client = new pg.Client({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });

    await client.connect();
    const result = await client.query("SELECT version()");
    await client.end();

    res.json({
      success: true,
      message: "Successfully connected to PostgreSQL database!",
      version: result.rows[0]?.version,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    if (client) {
      try { await client.end(); } catch {}
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET Schema SQL DDL script (PostgreSQL / Supabase)
databaseRouter.get("/database/schema-sql", async (req: any, res: any) => {
  try {
    const dump = await generatePostgresDump(false); // Schema only
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="slsu_payroll_schema.sql"');
    res.send(dump);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET Database Dump (Schema + Data)
databaseRouter.get("/database/postgresql-dump", async (req: any, res: any) => {
  try {
    const dump = await generatePostgresDump(true); // Schema + All Data
    const filename = `slsu_payroll_dump_${new Date().toISOString().slice(0, 10)}.sql`;
    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(dump);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST test database connection
databaseRouter.post("/database/test-connection", async (req: any, res: any) => {
  try {
    const result = await testPostgresConnection(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

