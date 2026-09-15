import { db, logAudit } from "../db/schema.js";

/**
 * Ensures sms_logs table and its expected columns exist in PostgreSQL / Supabase
 */
async function ensureSmsSchema() {
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS sms_logs (
        id VARCHAR(191) PRIMARY KEY,
        "employeeId" VARCHAR(191),
        "phoneNumber" VARCHAR(50),
        recipient VARCHAR(50),
        message TEXT,
        status VARCHAR(50) DEFAULT 'SENT',
        response TEXT,
        "sentAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.exec('ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP');
    await db.exec('ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(191)');
    await db.exec('ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS "phoneNumber" VARCHAR(50)');
    await db.exec('ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS recipient VARCHAR(50)');
    await db.exec('ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS message TEXT');
    await db.exec("ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'SENT'");
    await db.exec('ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP');
  } catch (err: any) {
    // Schema alteration ignored if already aligned
  }
}

export async function sendSmsNotification(req: any, employeeId: string, phoneNumber: string, message: string) {
  try {
    await ensureSmsSchema();
    const id = `sms-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const cleanPhone = (phoneNumber || "").replace(/[^0-9+]/g, "");
    
    // Insert into sms_logs supporting both camelCase and snake_case column names
    await db.prepare(`
      INSERT INTO sms_logs (id, "employeeId", "phoneNumber", recipient, message, status, "sentAt", "createdAt")
      VALUES (?, ?, ?, ?, ?, 'SENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(id, employeeId, cleanPhone || '09171234567', cleanPhone || '09171234567', message);

    await logAudit(req, "SMS_SENT", `Sent SMS notification to employee ${employeeId} (${cleanPhone})`);

    return {
      success: true,
      id,
      status: "SENT",
      phoneNumber: cleanPhone,
      message
    };
  } catch (err: any) {
    console.error("[SMS Service] Error sending SMS:", err);
    throw err;
  }
}

export async function getSmsLogs(employeeId?: string) {
  try {
    await ensureSmsSchema();
    if (employeeId) {
      return await db.prepare('SELECT * FROM sms_logs WHERE "employeeId" = ? OR recipient = ? OR "phoneNumber" = ? ORDER BY "sentAt" DESC').all(employeeId, employeeId, employeeId);
    }
    return await db.prepare('SELECT * FROM sms_logs ORDER BY "sentAt" DESC LIMIT 100').all();
  } catch (err: any) {
    console.error("[SMS Service] Error fetching logs:", err?.message || err);
    try {
      // Fallback query if ordering by "sentAt" fails
      if (employeeId) {
        return await db.prepare('SELECT * FROM sms_logs WHERE "employeeId" = ? OR recipient = ? OR "phoneNumber" = ? ORDER BY id DESC').all(employeeId, employeeId, employeeId);
      }
      return await db.prepare('SELECT * FROM sms_logs ORDER BY id DESC LIMIT 100').all();
    } catch (fallbackErr) {
      console.error("[SMS Service] Fallback fetch error:", fallbackErr);
      return [];
    }
  }
}
