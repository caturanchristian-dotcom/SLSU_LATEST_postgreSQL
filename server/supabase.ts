import { createClient, SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { db } from "./db/schema.js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const primaryKey = supabaseServiceKey || supabaseAnonKey;

export const hasSupabaseConfig = Boolean(supabaseUrl && primaryKey);

let adminClientInstance: SupabaseClient | null = null;
let anonClientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  return getSupabaseAdminClient();
}

/**
 * Admin client with Service Role Key for managing users, auth, bypassing RLS,
 * and administering all user profiles.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!supabaseUrl || !primaryKey) {
    return null;
  }
  if (!adminClientInstance) {
    adminClientInstance = createClient(supabaseUrl, primaryKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClientInstance;
}

/**
 * Client for standard auth operations like signInWithPassword.
 */
export function getSupabaseAnonClient(): SupabaseClient | null {
  const key = supabaseAnonKey || primaryKey;
  if (!supabaseUrl || !key) {
    return null;
  }
  if (!anonClientInstance) {
    anonClientInstance = createClient(supabaseUrl, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return anonClientInstance;
}

export const supabase = getSupabaseAdminClient();

export interface SyncUserParams {
  id?: string;
  email: string;
  password?: string;
  displayName?: string;
  role?: string;
  campus?: string;
  profileImage?: string;
}

export interface SupabaseAuthResult {
  success: boolean;
  user?: SupabaseUser | null;
  error?: string;
  action?: "created" | "updated" | "unchanged";
}

/**
 * Lists all registered users inside Supabase Auth
 */
export async function listSupabaseAuthUsers(): Promise<{ users: SupabaseUser[]; error: string | null }> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return { users: [], error: "Supabase client not configured" };
  }

  try {
    const allUsers: SupabaseUser[] = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage });
      if (error) {
        return { users: allUsers, error: error.message };
      }
      if (!data || !data.users || data.users.length === 0) {
        hasMore = false;
      } else {
        allUsers.push(...data.users);
        if (data.users.length < perPage) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }

    return { users: allUsers, error: null };
  } catch (err: any) {
    console.error("[Supabase Auth] listUsers error:", err);
    return { users: [], error: err.message || "Failed to list Supabase users" };
  }
}

/**
 * Finds a Supabase Auth user by email or database ID
 */
export async function findSupabaseUserByEmail(email: string): Promise<SupabaseUser | null> {
  const client = getSupabaseAdminClient();
  if (!client || !email) return null;

  try {
    const cleanEmail = email.trim().toLowerCase();
    const { users, error } = await listSupabaseAuthUsers();
    if (error) return null;
    return users.find(u => u.email?.toLowerCase() === cleanEmail) || null;
  } catch {
    return null;
  }
}

/**
 * Creates or updates a user in Supabase Auth
 */
export async function syncUserToSupabase(user: SyncUserParams): Promise<SupabaseAuthResult> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return { success: false, error: "Supabase is not configured in the environment." };
  }

  if (!user.email) {
    return { success: false, error: "Email is required to sync with Supabase Auth." };
  }

  const cleanEmail = user.email.trim().toLowerCase();
  const metadata = {
    db_id: user.id || "",
    displayName: user.displayName || user.email.split("@")[0],
    role: user.role || "employee",
    campus: user.campus || "Hinunangan Campus",
    profileImage: user.profileImage || "",
    updated_at: new Date().toISOString(),
  };

  try {
    const existing = await findSupabaseUserByEmail(cleanEmail);

    if (existing) {
      const updatePayload: any = {
        email_confirm: true,
        user_metadata: {
          ...existing.user_metadata,
          ...metadata,
        },
      };

      if (user.password && user.password.trim()) {
        const trimmed = user.password.trim();
        // Supabase Auth requires passwords to be at least 6 characters
        updatePayload.password = trimmed.length < 6 ? trimmed.padEnd(6, "0") : trimmed;
      }

      const { data, error } = await client.auth.admin.updateUserById(existing.id, updatePayload);
      if (error) {
        console.error(`[Supabase Auth] Error updating user ${cleanEmail}:`, error.message);
        return { success: false, error: error.message };
      }

      return { success: true, user: data.user, action: "updated" };
    } else {
      const rawPassword = user.password && user.password.trim() ? user.password.trim() : "password123";
      // Supabase Auth requires passwords to be at least 6 characters
      const password = rawPassword.length < 6 ? rawPassword.padEnd(6, "0") : rawPassword;
      const { data, error } = await client.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });

      if (error) {
        console.error(`[Supabase Auth] Error creating user ${cleanEmail}:`, error.message);
        return { success: false, error: error.message };
      }

      return { success: true, user: data.user, action: "created" };
    }
  } catch (err: any) {
    console.error(`[Supabase Auth] Exception syncing user ${cleanEmail}:`, err);
    return { success: false, error: err.message || "Failed to sync user with Supabase" };
  }
}

/**
 * Deletes a user from Supabase Auth
 */
export async function deleteUserFromSupabase(emailOrId: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseAdminClient();
  if (!client || !emailOrId) return { success: false, error: "Supabase client not configured" };

  try {
    const { users } = await listSupabaseAuthUsers();
    const target = users.find(
      u => u.id === emailOrId || u.email?.toLowerCase() === emailOrId.toLowerCase() || u.user_metadata?.db_id === emailOrId
    );

    if (!target) {
      return { success: true }; // Already doesn't exist
    }

    const { error } = await client.auth.admin.deleteUser(target.id);
    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Authenticates user credentials via Supabase Auth signInWithPassword
 */
export async function authenticateWithSupabase(email: string, password: string): Promise<{
  success: boolean;
  session?: any;
  user?: any;
  error?: string;
}> {
  const anonClient = getSupabaseAnonClient();
  if (!anonClient) {
    return { success: false, error: "Supabase Auth is not configured." };
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    let authRes = await anonClient.auth.signInWithPassword({
      email: cleanEmail,
      password: password,
    });

    if (authRes.error && password.length < 6) {
      // Supabase requires passwords to be at least 6 characters; retry with padded password
      const retry = await anonClient.auth.signInWithPassword({
        email: cleanEmail,
        password: password.padEnd(6, "0"),
      });
      if (!retry.error) {
        authRes = retry;
      }
    }

    if (authRes.error) {
      return { success: false, error: authRes.error.message };
    }

    return {
      success: true,
      session: authRes.data.session,
      user: authRes.data.user,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Supabase authentication failed" };
  }
}

/**
 * Synchronizes ALL users in the local database (users and employees) to Supabase Auth
 */
export async function syncAllUsersToSupabase(): Promise<{
  total: number;
  synced: number;
  created: number;
  updated: number;
  errors: string[];
}> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return { total: 0, synced: 0, created: 0, updated: 0, errors: ["Supabase is not configured"] };
  }

  let total = 0;
  let synced = 0;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  try {
    // 1. Fetch all users from DB
    const dbUsers = (await db.prepare("SELECT * FROM users").all()) as any[];
    // 2. Fetch all employees from DB
    const dbEmployees = (await db.prepare("SELECT * FROM employees WHERE email IS NOT NULL AND email != ''").all()) as any[];

    // Build unified map by email
    const usersMap = new Map<string, SyncUserParams>();

    for (const u of dbUsers) {
      if (u.email && u.email.trim()) {
        const email = u.email.trim().toLowerCase();
        usersMap.set(email, {
          id: u.id,
          email,
          password: u.password,
          displayName: u.displayName || u.email.split("@")[0],
          role: u.role || "employee",
          campus: u.campus || "Hinunangan Campus",
          profileImage: u.profileImage || "",
        });
      }
    }

    for (const emp of dbEmployees) {
      if (emp.email && emp.email.trim()) {
        const email = emp.email.trim().toLowerCase();
        const existing = usersMap.get(email);
        if (!existing) {
          usersMap.set(email, {
            id: emp.id,
            email,
            password: emp.password || "password123",
            displayName: `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.name || email.split("@")[0],
            role: "employee",
            campus: emp.campus || "Hinunangan Campus",
            profileImage: emp.profileImage || "",
          });
        }
      }
    }

    total = usersMap.size;
    console.log(`[Supabase Auth Sync] Starting sync for ${total} accounts...`);

    // Fetch existing users from Supabase in one batch
    const { users: existingSupabaseUsers } = await listSupabaseAuthUsers();
    const existingMap = new Map<string, SupabaseUser>();
    for (const su of existingSupabaseUsers) {
      if (su.email) {
        existingMap.set(su.email.toLowerCase(), su);
      }
    }

    for (const [email, userParams] of usersMap.entries()) {
      try {
        const existing = existingMap.get(email);
        const metadata = {
          db_id: userParams.id || "",
          displayName: userParams.displayName,
          role: userParams.role,
          campus: userParams.campus,
          profileImage: userParams.profileImage || "",
          updated_at: new Date().toISOString(),
        };

        if (existing) {
          const updatePayload: any = {
            email_confirm: true,
            user_metadata: {
              ...existing.user_metadata,
              ...metadata,
            },
          };
          if (userParams.password && userParams.password.trim()) {
            const trimmed = userParams.password.trim();
            updatePayload.password = trimmed.length < 6 ? trimmed.padEnd(6, "0") : trimmed;
          }

          const { error } = await client.auth.admin.updateUserById(existing.id, updatePayload);
          if (error) {
            errors.push(`${email}: ${error.message}`);
          } else {
            updated++;
            synced++;
          }
        } else {
          const rawPassword = userParams.password && userParams.password.trim() ? userParams.password.trim() : "password123";
          const password = rawPassword.length < 6 ? rawPassword.padEnd(6, "0") : rawPassword;
          const { error } = await client.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: metadata,
          });

          if (error) {
            errors.push(`${email}: ${error.message}`);
          } else {
            created++;
            synced++;
          }
        }
      } catch (userErr: any) {
        errors.push(`${email}: ${userErr.message}`);
      }
    }

    if (errors.length === 0) {
      console.log(`[Supabase Auth Sync] Synchronized ${synced}/${total} accounts successfully.`);
    } else {
      console.warn(`[Supabase Auth Sync] Synchronized ${synced}/${total} accounts with ${errors.length} skipped.`);
    }
  } catch (err: any) {
    console.error("[Supabase Auth Sync] Global sync error:", err);
    errors.push(err.message || "Failed to complete full sync");
  }

  return { total, synced, created, updated, errors };
}
