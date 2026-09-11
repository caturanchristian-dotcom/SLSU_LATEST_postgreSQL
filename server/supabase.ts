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

export const DEFAULT_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "employee-images";

/**
 * Ensures the Supabase Storage bucket exists and is public.
 */
export async function ensureStorageBucketExists(bucketName: string = DEFAULT_STORAGE_BUCKET): Promise<boolean> {
  const client = getSupabaseAdminClient();
  if (!client) return false;

  try {
    const { data: buckets, error } = await client.storage.listBuckets();
    if (error) {
      console.warn("[Supabase Storage] listBuckets error:", error.message);
      return false;
    }

    const exists = buckets?.some(b => b.name === bucketName);
    if (!exists) {
      console.log(`[Supabase Storage] Bucket '${bucketName}' not found. Creating public bucket...`);
      const { error: createErr } = await client.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 20971520, // 20MB
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]
      });
      if (createErr) {
        console.warn(`[Supabase Storage] Could not auto-create bucket '${bucketName}':`, createErr.message);
        return false;
      }
      console.log(`[Supabase Storage] Successfully created public bucket '${bucketName}'.`);
    }
    return true;
  } catch (err: any) {
    console.warn("[Supabase Storage] Error checking/creating bucket:", err.message);
    return false;
  }
}

/**
 * Extracts the bucket name and object storage path from a public or signed Supabase Storage URL.
 */
export function extractStorageInfoFromUrl(
  imageUrl: string, 
  defaultBucket: string = DEFAULT_STORAGE_BUCKET
): { bucket: string; path: string } | null {
  if (!imageUrl || typeof imageUrl !== "string") return null;

  // Skip data URLs or external non-Supabase URLs
  if (imageUrl.startsWith("data:") || imageUrl.includes("blogspot.com") || imageUrl.includes("slsuLogo")) {
    return null;
  }

  // If already relative path: e.g. "avatars/photo.jpg"
  if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
    return { bucket: defaultBucket, path: imageUrl.replace(/^\/+/, "") };
  }

  // Regex to match Supabase storage URLs:
  // e.g. /storage/v1/object/(public|sign|authenticated)/([^\/]+)/(.+)
  const match = imageUrl.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?#]+)/);
  if (match && match[1] && match[2]) {
    return {
      bucket: decodeURIComponent(match[1]),
      path: decodeURIComponent(match[2]),
    };
  }

  // Fallback: check if URL contains bucketName
  const searchStr = `/${defaultBucket}/`;
  const idx = imageUrl.indexOf(searchStr);
  if (idx !== -1) {
    const rawPath = imageUrl.substring(idx + searchStr.length).split("?")[0];
    return { bucket: defaultBucket, path: decodeURIComponent(rawPath) };
  }

  return null;
}

/**
 * Deletes an image from Supabase Storage given its public URL or storage path.
 */
export async function deleteImageFromSupabase(
  imageUrlOrPath: string,
  targetBucket: string = DEFAULT_STORAGE_BUCKET
): Promise<{ success: boolean; error?: string }> {
  if (!imageUrlOrPath) return { success: false, error: "No image specified" };

  const storageInfo = extractStorageInfoFromUrl(imageUrlOrPath, targetBucket);
  if (!storageInfo || !storageInfo.path) {
    // Not a Supabase storage URL (e.g. data URL or external asset), safe to ignore
    return { success: true };
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return { success: false, error: "Supabase client is not configured" };
  }

  try {
    const bucket = storageInfo.bucket || targetBucket;
    const path = storageInfo.path;
    console.log(`[Supabase Storage] Deleting old image '${path}' from bucket '${bucket}'...`);
    const { error } = await client.storage.from(bucket).remove([path]);
    
    if (error) {
      console.warn(`[Supabase Storage] Failed to remove '${path}':`, error.message);
      return { success: false, error: error.message };
    }

    console.log(`[Supabase Storage] Successfully deleted old image '${path}' from bucket '${bucket}'.`);
    return { success: true };
  } catch (err: any) {
    console.warn(`[Supabase Storage] Error deleting old image '${imageUrlOrPath}':`, err.message || err);
    return { success: false, error: err.message || "Failed to delete old image" };
  }
}

/**
 * Uploads an image (Buffer, base64 Data URL, or raw base64) to Supabase Storage and returns the public CDN URL.
 * Automatically deletes the old image if 'oldImageUrl' is specified.
 */
export async function uploadImageToSupabase(
  imageData: string | Buffer,
  options: {
    filename?: string;
    folder?: string;
    bucket?: string;
    mimeType?: string;
    oldImageUrl?: string;
  } = {}
): Promise<{ success: boolean; publicUrl: string; path?: string; error?: string }> {
  const client = getSupabaseAdminClient();
  const bucketName = options.bucket || DEFAULT_STORAGE_BUCKET;

  if (!client) {
    return {
      success: false,
      publicUrl: typeof imageData === "string" ? imageData : "",
      error: "Supabase client is not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)",
    };
  }

  try {
    await ensureStorageBucketExists(bucketName);

    let buffer: Buffer;
    let contentType = options.mimeType || "image/jpeg";
    let fileExt = "jpg";

    if (typeof imageData === "string") {
      // If already an external HTTP/HTTPS URL, return directly
      if (imageData.startsWith("http://") || imageData.startsWith("https://")) {
        return { success: true, publicUrl: imageData };
      }

      // Check if it is a base64 data url
      if (imageData.startsWith("data:")) {
        const matches = imageData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          contentType = matches[1];
          buffer = Buffer.from(matches[2], "base64");
          const ext = contentType.split("/")[1] || "jpg";
          fileExt = ext === "jpeg" ? "jpg" : ext.replace(/[^a-zA-Z0-9]/g, "");
        } else {
          buffer = Buffer.from(imageData, "base64");
        }
      } else {
        buffer = Buffer.from(imageData, "base64");
      }
    } else {
      buffer = imageData;
    }

    const folder = options.folder ? `${options.folder.replace(/\/$/, '')}/` : "";
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const baseName = options.filename ? options.filename.replace(/[^a-zA-Z0-9_-]/g, "_") : "photo";
    const filePath = `${folder}${baseName}-${uniqueId}.${fileExt}`;

    const { data: uploadData, error: uploadErr } = await client.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadErr) {
      console.error(`[Supabase Storage] Failed to upload ${filePath}:`, uploadErr.message);
      return {
        success: false,
        publicUrl: typeof imageData === "string" ? imageData : "",
        error: uploadErr.message,
      };
    }

    const { data: urlData } = client.storage.from(bucketName).getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl;

    console.log(`[Supabase Storage] Image uploaded successfully: ${publicUrl}`);

    // If an old image URL was provided, automatically delete it from storage
    if (options.oldImageUrl && options.oldImageUrl !== publicUrl) {
      deleteImageFromSupabase(options.oldImageUrl, bucketName).catch(delErr => {
        console.warn("[Supabase Storage] Auto-deletion of old image failed:", delErr);
      });
    }

    return {
      success: true,
      publicUrl,
      path: filePath,
    };
  } catch (err: any) {
    console.error("[Supabase Storage] Unexpected upload error:", err);
    return {
      success: false,
      publicUrl: typeof imageData === "string" ? imageData : "",
      error: err.message || "Failed to upload image to Supabase",
    };
  }
}

/**
 * Returns the current status of Supabase Storage.
 */
export async function getStorageStatus(bucketName: string = DEFAULT_STORAGE_BUCKET) {
  const client = getSupabaseAdminClient();
  if (!client) {
    return {
      isConfigured: false,
      bucketName,
      bucketExists: false,
      fileCount: 0,
      error: "Supabase credentials not configured in environment"
    };
  }

  try {
    const { data: buckets, error: bucketError } = await client.storage.listBuckets();
    if (bucketError) {
      return {
        isConfigured: true,
        bucketName,
        bucketExists: false,
        fileCount: 0,
        error: bucketError.message
      };
    }

    const bucket = buckets?.find(b => b.name === bucketName);
    let fileCount = 0;

    if (bucket) {
      const { data: files } = await client.storage.from(bucketName).list("", { limit: 100 });
      fileCount = files?.length || 0;
    }

    return {
      isConfigured: true,
      bucketName,
      bucketExists: Boolean(bucket),
      isPublic: bucket?.public ?? true,
      fileCount,
    };
  } catch (err: any) {
    return {
      isConfigured: true,
      bucketName,
      bucketExists: false,
      fileCount: 0,
      error: err.message
    };
  }
}

/**
 * Migrates existing base64 images in employees and users tables to Supabase Storage.
 */
export async function migrateBase64ImagesToSupabase(bucketName: string = DEFAULT_STORAGE_BUCKET) {
  const results = {
    employeesScanned: 0,
    employeesMigrated: 0,
    usersScanned: 0,
    usersMigrated: 0,
    errors: [] as string[]
  };

  const client = getSupabaseAdminClient();
  if (!client) {
    results.errors.push("Supabase is not configured.");
    return results;
  }

  try {
    await ensureStorageBucketExists(bucketName);

    // 1. Employees table
    const employees = await db.prepare(
      "SELECT id, employeeId, firstName, lastName, profileImage FROM employees WHERE profileImage LIKE 'data:image/%'"
    ).all() as any[];

    results.employeesScanned = employees.length;

    for (const emp of employees) {
      try {
        const upload = await uploadImageToSupabase(emp.profileImage, {
          filename: `emp-${emp.employeeId || emp.id}`,
          folder: "employees",
          bucket: bucketName
        });

        if (upload.success && upload.publicUrl) {
          await db.prepare('UPDATE employees SET "profileImage" = ? WHERE id = ?').run(upload.publicUrl, emp.id);
          // Also update users table if exists
          try {
            await db.prepare('UPDATE users SET "profileImage" = ? WHERE id = ?').run(upload.publicUrl, emp.id);
          } catch {}
          results.employeesMigrated++;
        } else if (upload.error) {
          results.errors.push(`Employee ${emp.id}: ${upload.error}`);
        }
      } catch (e: any) {
        results.errors.push(`Employee ${emp.id}: ${e.message}`);
      }
    }

    // 2. Users table
    const users = await db.prepare(
      "SELECT id, email, profileImage FROM users WHERE profileImage LIKE 'data:image/%'"
    ).all() as any[];

    results.usersScanned = users.length;

    for (const u of users) {
      try {
        const upload = await uploadImageToSupabase(u.profileImage, {
          filename: `user-${u.id}`,
          folder: "users",
          bucket: bucketName
        });

        if (upload.success && upload.publicUrl) {
          await db.prepare('UPDATE users SET "profileImage" = ? WHERE id = ?').run(upload.publicUrl, u.id);
          results.usersMigrated++;
        } else if (upload.error) {
          results.errors.push(`User ${u.email}: ${upload.error}`);
        }
      } catch (e: any) {
        results.errors.push(`User ${u.email}: ${e.message}`);
      }
    }

    console.log(`[Supabase Storage Migration] Migrated ${results.employeesMigrated} employees and ${results.usersMigrated} users to Supabase Storage.`);
  } catch (err: any) {
    console.error("[Supabase Storage Migration] Error during migration:", err);
    results.errors.push(err.message || "Migration failed");
  }

  return results;
}
