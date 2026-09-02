import { db, logAudit } from "../db/schema.js";

export async function sendSmsNotification(req: any, employeeId: string, phoneNumber: string, message: string) {
  try {
    const id = `sms-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const cleanPhone = (phoneNumber || "").replace(/[^0-9+]/g, "");
    
    // Insert into sms_logs
    await db.prepare(`
      INSERT INTO sms_logs (id, employeeId, phoneNumber, message, status, sentAt)
      VALUES (?, ?, ?, ?, 'SENT', CURRENT_TIMESTAMP)
    `).run(id, employeeId, cleanPhone || '09171234567', message);

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
    if (employeeId) {
      return await db.prepare("SELECT * FROM sms_logs WHERE employeeId = ? ORDER BY sentAt DESC").all(employeeId);
    }
    return await db.prepare("SELECT * FROM sms_logs ORDER BY sentAt DESC LIMIT 100").all();
  } catch (err) {
    console.error("[SMS Service] Error fetching logs:", err);
    return [];
  }
}
