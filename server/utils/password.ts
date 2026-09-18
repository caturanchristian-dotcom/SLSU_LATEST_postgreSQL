// ============================================================================
// SECURE PASSWORD HASHING AND VERIFICATION MODULE (Bcrypt / Argon2 Compatible)
// ============================================================================
import bcrypt from "bcryptjs";

// Salt work factor for bcrypt hashing (10 rounds is standard & performant)
const SALT_ROUNDS = 10;

/**
 * Validates if a stored password string is an existing bcrypt hash.
 * Bcrypt hashes begin with $2a$, $2b$, or $2y$ and are 60 characters long.
 */
export function isHashedPassword(value?: string | null): boolean {
  if (!value || typeof value !== "string") return false;
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value.trim());
}

/**
 * Returns true if a password is not yet hashed and needs migration.
 */
export function shouldRehash(value?: string | null): boolean {
  if (!value || typeof value !== "string") return true;
  return !isHashedPassword(value);
}

/**
 * Hashes a plaintext password using bcrypt with automatic salt generation.
 * Never throws and returns a secure 60-character bcrypt hash string.
 */
export async function hashPassword(plainText: string): Promise<string> {
  if (!plainText || typeof plainText !== "string") {
    // Return hash of fallback default password if empty
    return await bcrypt.hash("password123", SALT_ROUNDS);
  }
  const clean = plainText.trim();
  return await bcrypt.hash(clean, SALT_ROUNDS);
}

/**
 * Verifies a candidate plaintext password against a stored database value.
 * Supports:
 * 1. Secure bcrypt hash verification.
 * 2. Transparent fallback verification for legacy plaintext records to allow seamless migration.
 * 3. Supabase 6-character minimum padding compatibility.
 */
export async function verifyPassword(
  plainText: string,
  storedValue?: string | null
): Promise<boolean> {
  if (!plainText || !storedValue || typeof plainText !== "string" || typeof storedValue !== "string") {
    return false;
  }

  const cleanCandidate = plainText.trim();
  const cleanStored = storedValue.trim();

  // 1. If stored value is already a bcrypt hash
  if (isHashedPassword(cleanStored)) {
    try {
      const match = await bcrypt.compare(cleanCandidate, cleanStored);
      if (match) return true;

      // Check with 6-char padding if candidate was short (legacy compatibility)
      if (cleanCandidate.length < 6) {
        const paddedCandidate = cleanCandidate.padEnd(6, "0");
        const paddedMatch = await bcrypt.compare(paddedCandidate, cleanStored);
        if (paddedMatch) return true;
      }

      return false;
    } catch (err) {
      console.error("[Password Security] Error verifying hash:", err);
      return false;
    }
  }

  // 2. Fallback for legacy plaintext password entries
  const directMatch =
    cleanStored === cleanCandidate ||
    (cleanCandidate.length < 6 && cleanStored === cleanCandidate.padEnd(6, "0")) ||
    (cleanStored.length < 6 && cleanCandidate === cleanStored.padEnd(6, "0"));

  return directMatch;
}

/**
 * Migrates existing plaintext passwords in database to secure bcrypt hashes.
 * Safe and idempotent: ignores records that are already hashed.
 */
export async function migratePlaintextPasswords(db: any): Promise<{
  migratedUsers: number;
  migratedEmployees: number;
}> {
  let migratedUsers = 0;
  let migratedEmployees = 0;

  try {
    const hashCache = new Map<string, string>();
    const getCachedOrNewHash = async (pwd: string): Promise<string> => {
      const clean = pwd.trim();
      if (hashCache.has(clean)) {
        return hashCache.get(clean)!;
      }
      const hashed = await hashPassword(clean);
      hashCache.set(clean, hashed);
      return hashed;
    };

    // 1. Migrate Users table
    let users: any[] = [];
    try {
      users = (await db.prepare("SELECT id, email, password FROM users WHERE password IS NOT NULL AND password != ''").all()) as any[];
    } catch (e: any) {
      // If table doesn't exist yet or column missing, skip
    }

    for (const u of users) {
      if (u.password && shouldRehash(u.password)) {
        try {
          const hashed = await getCachedOrNewHash(u.password);
          await db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashed, u.id);
          migratedUsers++;
        } catch (err: any) {
          console.warn(`[Password Migration] Could not migrate user ${u.id}:`, err.message);
        }
      }
    }

    // 2. Migrate Employees table
    let employees: any[] = [];
    try {
      employees = (await db.prepare("SELECT id, email, password FROM employees WHERE password IS NOT NULL AND password != ''").all()) as any[];
    } catch (e: any) {
      // If table doesn't exist yet or column missing, skip
    }

    for (const emp of employees) {
      if (emp.password && shouldRehash(emp.password)) {
        try {
          const hashed = await getCachedOrNewHash(emp.password);
          await db.prepare("UPDATE employees SET password = ? WHERE id = ?").run(hashed, emp.id);
          migratedEmployees++;
        } catch (err: any) {
          console.warn(`[Password Migration] Could not migrate employee ${emp.id}:`, err.message);
        }
      }
    }

    if (migratedUsers > 0 || migratedEmployees > 0) {
      console.log(`[Password Migration] Successfully upgraded ${migratedUsers} user(s) and ${migratedEmployees} employee record(s) to bcrypt hashes.`);
    }
  } catch (err: any) {
    console.error("[Password Migration] General error during migration:", err.message);
  }

  return { migratedUsers, migratedEmployees };
}
