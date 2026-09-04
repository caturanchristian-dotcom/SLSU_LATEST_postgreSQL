import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";

import { initDb } from "./db/schema.js";
import { authRouter } from "./routes/auth.js";
import { employeesRouter } from "./routes/employees.js";
import { payrollRouter } from "./routes/payroll.js";
import { dtrRouter } from "./routes/dtr.js";
import { deductionsRouter } from "./routes/deductions.js";
import { usersRouter } from "./routes/users.js";
import { reportsRouter } from "./routes/reports.js";
import { databaseRouter } from "./routes/database.js";
import { integrationsRouter } from "./routes/integrations.js";

dotenv.config();

const app = express();
const PORT = 3000;

// SSE Client list
let sseClients: { id: number; res: any }[] = [];

export function broadcastRealtime(event: string, data: any = {}) {
  const payload = `data: ${JSON.stringify({ event, data, timestamp: Date.now() })}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.res.write(payload);
    } catch (err) {
      // Ignore closed stream errors
    }
  });
}

export async function startServer() {
  // 1. Initialize Database Schema & Seed Data
  await initDb();

  // 2. Middlewares
  app.use(cors());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // 3. SSE Real-Time Heartbeat & Endpoint
  setInterval(() => {
    sseClients.forEach((client) => {
      try {
        client.res.write(`: heartbeat\n\n`);
      } catch (err) {}
    });
  }, 15000);

  app.get("/api/realtime", (req: any, res: any) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    sseClients.push(newClient);

    try {
      res.write(`data: ${JSON.stringify({ event: "connected", data: { clientId } })}\n\n`);
    } catch (err) {}

    req.on("close", () => {
      sseClients = sseClients.filter((c) => c.id !== clientId);
    });
  });

  // Mutating Request Interceptor for Automatic Real-Time Synchronization
  app.use((req: any, res: any, next: any) => {
    const isMutating = ["POST", "PUT", "DELETE"].includes(req.method);
    if (isMutating && req.path.startsWith("/api/")) {
      res.on("finish", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const segments = req.path.split("/");
          const moduleName = segments[2];
          if (moduleName) {
            broadcastRealtime(moduleName + "_changed", {
              method: req.method,
              path: req.path,
              module: moduleName
            });

            const normalizedModule = moduleName.replace(/-/g, "_");
            if (normalizedModule !== moduleName) {
              broadcastRealtime(normalizedModule + "_changed", {
                method: req.method,
                path: req.path,
                module: moduleName
              });
            }

            if (moduleName.startsWith("payroll") || moduleName.startsWith("deduction")) {
              broadcastRealtime("payroll_changed", { path: req.path });
              broadcastRealtime("deductions_changed", { path: req.path });
              broadcastRealtime("deduction_records_changed", { path: req.path });
            }

            if (moduleName === "dtr" || moduleName === "schedules") {
              broadcastRealtime("dtr_changed", { path: req.path });
              broadcastRealtime("schedules_changed", { path: req.path });
              broadcastRealtime("payroll_changed", { path: req.path, source: "dtr" });
            }
          }
        }
      });
    }
    next();
  });

  // 4. API Routes
  app.use("/api/auth", authRouter);
  app.use("/api", employeesRouter);
  app.use("/api", payrollRouter);
  app.use("/api", dtrRouter);
  app.use("/api", deductionsRouter);
  app.use("/api", usersRouter);
  app.use("/api", reportsRouter);
  app.use("/api", databaseRouter);
  app.use("/api", integrationsRouter);

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // 5. Frontend Vite Middleware / Static Files
  if (process.env.NODE_ENV !== "production") {
    const isHmrDisabled = process.env.DISABLE_HMR === "true" || process.env.DISABLE_HMR === "1";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : undefined,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // 6. Listen on 0.0.0.0:3000
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SLSU Server] Running on http://localhost:${PORT}`);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[SLSU Server] Port ${PORT} is currently busy, waiting for release...`);
    } else {
      console.error("[SLSU Server] Server error:", err.message);
    }
  });

  const cleanup = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}

export default app;
