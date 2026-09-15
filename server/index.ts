// ============================================================================
// MAIN APPLICATION SERVER & API GATEWAY (Express + Vite + SSE Real-Time Sync)
// ============================================================================
// Import Express HTTP web framework
import express from "express";
// Import Vite development server factory for hot module integration
import { createServer as createViteServer } from "vite";
// Import Node.js built-in path module for filesystem path resolutions
import path from "path";
// Import Cross-Origin Resource Sharing middleware
import cors from "cors";
// Import Dotenv to load environment variables from .env file
import dotenv from "dotenv";

// Import database initialization function (creates tables, seeds data, runs migrations)
import { initDb } from "./db/schema.js";
// Import Authentication API router (login, OAuth, password changes, token verification)
import { authRouter } from "./routes/auth.js";
// Import Employee API router (CRUD, bulk import, multi-campus filtering, Supabase sync)
import { employeesRouter } from "./routes/employees.js";
// Import Payroll API router (cycles, payslips, 13th month, allowances, teaching overload)
import { payrollRouter } from "./routes/payroll.js";
// Import DTR API router (biometric logs, daily attendance, holidays, travel orders, leaves)
import { dtrRouter } from "./routes/dtr.js";
// Import Deductions API router (mandatory contributions, custom deductions, loan amortizations)
import { deductionsRouter } from "./routes/deductions.js";
// Import Users API router (system accounts, role permissions, profile settings)
import { usersRouter } from "./routes/users.js";
// Import Reports API router (BIR 2316, payroll summaries, general ledger exports)
import { reportsRouter } from "./routes/reports.js";
// Import Database API router (status checks, SQL dumps, DDL schema generation)
import { databaseRouter } from "./routes/database.js";
// Import School API Integrations router (SIS sync, biometrics webhooks, mock gateways)
import { integrationsRouter } from "./routes/integrations.js";
// Import Cloud Storage API router (Supabase Storage image uploads and deletions)
import { storageRouter } from "./routes/storage.js";

// Initialize environment variables from .env into process.env
dotenv.config();

// Create main Express web application instance
const app = express();
// Declare server listening port (strictly port 3000)
const PORT = 3000;

// Array to hold active Server-Sent Events (SSE) connected clients for real-time live updates
let sseClients: { id: number; res: any }[] = [];

// ============================================================================
// Helper Function: Broadcast Real-Time Events to Connected Clients
// Pushes server-sent events (SSE) to all active browser tabs instantly
// ============================================================================
export function broadcastRealtime(event: string, data: any = {}) {
  // Format standard SSE event payload string
  const payload = `data: ${JSON.stringify({ event, data, timestamp: Date.now() })}\n\n`;
  // Iterate through all connected client streams
  sseClients.forEach((client) => {
    try {
      // Write data chunk to client response socket
      client.res.write(payload);
    } catch (err) {
      // Ignore closed stream write errors (handled by close event handler)
    }
  });
}

// ============================================================================
// Main Server Bootstrapper Function
// ============================================================================
export async function startServer() {
  // 1. Initialize Database Schema & Seed Default Data
  await initDb();

  // 2. Global Request Middlewares
  // Enable CORS for cross-origin requests
  app.use(cors());
  // Parse incoming JSON request bodies up to 50MB limit (for base64 images & bulk uploads)
  app.use(express.json({ limit: "50mb" }));
  // Parse URL-encoded form data with rich objects enabled
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // 3. SSE Real-Time Heartbeat Interval & Subscription Endpoint
  // Send heartbeat comment ping every 15 seconds to keep HTTP connections alive through proxies
  setInterval(() => {
    sseClients.forEach((client) => {
      try {
        client.res.write(`: heartbeat\n\n`);
      } catch (err) {}
    });
  }, 15000);

  // SSE streaming endpoint: GET /api/realtime
  app.get("/api/realtime", (req: any, res: any) => {
    // Set headers for persistent text/event-stream
    res.setHeader("Content-Type", "text/event-stream");
    // Disable caching on SSE stream
    res.setHeader("Cache-Control", "no-cache");
    // Keep connection persistent
    res.setHeader("Connection", "keep-alive");
    // Flush response headers immediately to browser
    res.flushHeaders();

    // Assign unique client identifier
    const clientId = Date.now();
    const newClient = { id: clientId, res };
    // Register new client in active list
    sseClients.push(newClient);

    // Send initial handshake confirmation to frontend
    try {
      res.write(`data: ${JSON.stringify({ event: "connected", data: { clientId } })}\n\n`);
    } catch (err) {}

    // Clean up disconnected client when connection closes
    req.on("close", () => {
      sseClients = sseClients.filter((c) => c.id !== clientId);
    });
  });

  // Mutating Request Interceptor for Automatic Real-Time Synchronization
  // Listens to POST, PUT, DELETE operations on /api/* and automatically triggers SSE events
  app.use((req: any, res: any, next: any) => {
    // Determine if HTTP method modifies state
    const isMutating = ["POST", "PUT", "DELETE"].includes(req.method);
    // If request targets an API endpoint
    if (isMutating && req.path.startsWith("/api/")) {
      // Attach listener to response finish event
      res.on("finish", () => {
        // If operation succeeded (HTTP 2xx)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Parse module name from URL path (e.g., /api/employees -> employees)
          const segments = req.path.split("/");
          const moduleName = segments[2];
          if (moduleName) {
            // Broadcast primary module change event
            broadcastRealtime(moduleName + "_changed", {
              method: req.method,
              path: req.path,
              module: moduleName
            });

            // Broadcast normalized underscore variation if path has dashes
            const normalizedModule = moduleName.replace(/-/g, "_");
            if (normalizedModule !== moduleName) {
              broadcastRealtime(normalizedModule + "_changed", {
                method: req.method,
                path: req.path,
                module: moduleName
              });
            }

            // If payroll or deduction changes, trigger dependent recalculations
            if (moduleName.startsWith("payroll") || moduleName.startsWith("deduction")) {
              broadcastRealtime("payroll_changed", { path: req.path });
              broadcastRealtime("deductions_changed", { path: req.path });
              broadcastRealtime("deduction_records_changed", { path: req.path });
            }

            // If DTR or schedule changes, trigger DTR and payroll recalculation
            if (moduleName === "dtr" || moduleName === "schedules") {
              broadcastRealtime("dtr_changed", { path: req.path });
              broadcastRealtime("schedules_changed", { path: req.path });
              broadcastRealtime("payroll_changed", { path: req.path, source: "dtr" });
            }
          }
        }
      });
    }
    // Proceed to next middleware or route handler
    next();
  });

  // 4. API Route Registrations
  // Mount Authentication routes under /api/auth
  app.use("/api/auth", authRouter);
  // Mount Employee routes under /api (e.g. /api/employees)
  app.use("/api", employeesRouter);
  // Mount Payroll routes under /api (e.g. /api/payroll/cycles)
  app.use("/api", payrollRouter);
  // Mount DTR routes under /api (e.g. /api/dtr/records)
  app.use("/api", dtrRouter);
  // Mount Deductions routes under /api (e.g. /api/deductions)
  app.use("/api", deductionsRouter);
  // Mount Users routes under /api (e.g. /api/users)
  app.use("/api", usersRouter);
  // Mount Reports routes under /api (e.g. /api/reports/summary)
  app.use("/api", reportsRouter);
  // Mount Database routes under /api (e.g. /api/database/status)
  app.use("/api", databaseRouter);
  // Mount School API Integration routes under /api (e.g. /api/integrations/sync/*)
  app.use("/api", integrationsRouter);
  // Mount Storage routes under /api (e.g. /api/storage/upload)
  app.use("/api", storageRouter);

  // Health check endpoint for container uptime monitoring
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // 5. Frontend Vite Middleware / Static Files Serving
  // In development: mount Vite dev server as middleware for instant client rendering
  if (process.env.NODE_ENV !== "production") {
    // Check if hot module replacement is disabled
    const isHmrDisabled = process.env.DISABLE_HMR === "true" || process.env.DISABLE_HMR === "1";
    // Create Vite server instance in middleware mode
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : undefined,
      },
      appType: "spa",
    });
    // Mount Vite middlewares into Express pipeline
    app.use(vite.middlewares);
  } else {
    // In production: serve compiled static assets from dist/ directory
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // SPA fallback route: route all non-API GET requests to index.html
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // 6. Bind Server Listener on Port 3000
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SLSU Server] Running on http://localhost:${PORT}`);
  });

  // Listen for socket errors (e.g. address in use during restarts)
  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[SLSU Server] Port ${PORT} is currently busy, waiting for release...`);
    } else {
      console.error("[SLSU Server] Server error:", err.message);
    }
  });

  // Process termination cleanup handler
  const cleanup = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  // Register signal listeners for graceful shutdown
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}

// Export Express app instance as default export
export default app;
