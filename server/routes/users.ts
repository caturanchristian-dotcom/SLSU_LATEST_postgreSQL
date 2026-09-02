import { Router } from "express";
import { db, logAudit } from "../db/schema.js";
import { 
  hasSupabaseConfig, 
  syncUserToSupabase, 
  deleteUserFromSupabase, 
  syncAllUsersToSupabase,
  listSupabaseAuthUsers
} from "../supabase.js";

export const usersRouter = Router();

// GET all users
usersRouter.get("/users", async (req: any, res: any) => {
  try {
    let users: any[] = [];
    try {
      users = await db.prepare("SELECT id, email, displayName, role, campus, createdAt FROM users ORDER BY createdAt DESC").all();
    } catch {
      try {
        users = await db.prepare("SELECT id, email, displayName, role, campus, created_at as createdAt FROM users ORDER BY created_at DESC").all();
      } catch {
        users = await db.prepare("SELECT id, email, displayName, role, campus FROM users ORDER BY id DESC").all();
      }
    }
    
    // Check Supabase status if configured
    let supabaseAuthEmails = new Set<string>();
    if (hasSupabaseConfig) {
      try {
        const { users: sUsers } = await listSupabaseAuthUsers();
        sUsers.forEach(su => {
          if (su.email) supabaseAuthEmails.add(su.email.toLowerCase());
        });
      } catch (sErr) {
        console.warn("[Users] Failed to fetch Supabase user list for badges:", sErr);
      }
    }

    const enhancedUsers = users.map((u: any) => ({
      ...u,
      isSupabaseSynced: hasSupabaseConfig ? supabaseAuthEmails.has(u.email?.toLowerCase()) : false
    }));

    res.json(enhancedUsers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET Supabase Auth Status for Users
usersRouter.get("/users/supabase-status", async (req: any, res: any) => {
  try {
    if (!hasSupabaseConfig) {
      return res.json({
        isConfigured: false,
        totalAuthUsers: 0,
        authUsers: [],
        message: "Supabase credentials are not configured in environment variables."
      });
    }

    const { users, error } = await listSupabaseAuthUsers();
    if (error) {
      return res.status(500).json({
        isConfigured: true,
        error,
        totalAuthUsers: 0,
        authUsers: []
      });
    }

    const authUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      metadata: u.user_metadata,
      email_confirmed: !!u.email_confirmed_at
    }));

    res.json({
      isConfigured: true,
      totalAuthUsers: users.length,
      authUsers,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Trigger Full Sync to Supabase Auth
usersRouter.post("/users/sync-supabase", async (req: any, res: any) => {
  try {
    if (!hasSupabaseConfig) {
      return res.status(400).json({ error: "Supabase is not configured." });
    }

    const result = await syncAllUsersToSupabase();
    await logAudit(req, "SYNC_SUPABASE_USERS", `Synchronized ${result.synced} user accounts to Supabase Auth`);
    res.json({
      success: true,
      ...result,
      message: `Successfully synchronized ${result.synced} user accounts with Supabase Authentication.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE User
usersRouter.post("/users", async (req: any, res: any) => {
  try {
    const { email, password, displayName, role, campus } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const id = `user-${Date.now()}`;
    const cleanEmail = email.toLowerCase().trim();
    const cleanPassword = password || "password123";
    const cleanDisplayName = displayName || cleanEmail.split("@")[0];
    const cleanRole = role || "employee";
    const cleanCampus = campus || "Hinunangan Campus";

    await db.prepare(`
      INSERT INTO users (id, email, password, displayName, role, campus)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, cleanEmail, cleanPassword, cleanDisplayName, cleanRole, cleanCampus);

    // Sync to Supabase Auth
    if (hasSupabaseConfig) {
      await syncUserToSupabase({
        id,
        email: cleanEmail,
        password: cleanPassword,
        displayName: cleanDisplayName,
        role: cleanRole,
        campus: cleanCampus
      });
    }

    await logAudit(req, "CREATE_USER", `Created user account ${cleanDisplayName} (${cleanEmail}) [Supabase Auth enabled]`);
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE User
usersRouter.put("/users/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { email, password, displayName, role, campus } = req.body;

    const cleanEmail = email ? email.toLowerCase().trim() : "";
    let query = "UPDATE users SET email = ?, displayName = ?, role = ?, campus = ?";
    let params: any[] = [cleanEmail, displayName, role, campus || "Hinunangan Campus"];

    if (password?.trim()) {
      query += ", password = ?";
      params.push(password.trim());
    }

    query += " WHERE id = ?";
    params.push(id);

    await db.prepare(query).run(...params);

    // Sync updates to Supabase Auth
    if (hasSupabaseConfig && cleanEmail) {
      await syncUserToSupabase({
        id,
        email: cleanEmail,
        password: password?.trim() || undefined,
        displayName,
        role,
        campus
      });
    }

    await logAudit(req, "UPDATE_USER", `Updated user account ${displayName} (${cleanEmail})`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE User
usersRouter.delete("/users/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const existing = await db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;

    await db.prepare("DELETE FROM users WHERE id = ?").run(id);

    // Delete from Supabase Auth
    if (hasSupabaseConfig && existing?.email) {
      await deleteUserFromSupabase(existing.email);
    }

    await logAudit(req, "DELETE_USER", `Deleted user account ID ${id} (${existing?.email || ''})`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Profile Management
usersRouter.get("/profile", async (req: any, res: any) => {
  try {
    const userId = req.headers['x-user-id'] || req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    if (!user) return res.status(404).json({ error: "User not found" });

    const employee = await db.prepare("SELECT * FROM employees WHERE id = ? OR LOWER(email) = ?").get(userId, user.email?.toLowerCase()) as any;

    const { password: _, ...safeUser } = user;
    res.json({
      ...safeUser,
      employeeDetails: employee || null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

usersRouter.put("/profile", async (req: any, res: any) => {
  try {
    const { email, displayName, password, profileImage } = req.body;
    const cleanEmail = email?.toLowerCase().trim();
    const user = await db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(cleanEmail) as any;
    if (!user) return res.status(404).json({ error: "User not found" });

    let query = "UPDATE users SET displayName = ?";
    let params: any[] = [displayName];

    if (profileImage !== undefined) {
      query += ", profileImage = ?";
      params.push(profileImage);
    }
    if (password?.trim()) {
      query += ", password = ?";
      params.push(password.trim());
    }

    query += " WHERE id = ?";
    params.push(user.id);

    await db.prepare(query).run(...params);

    // Sync profile updates to Supabase Auth
    if (hasSupabaseConfig && cleanEmail) {
      await syncUserToSupabase({
        id: user.id,
        email: cleanEmail,
        displayName,
        password: password?.trim() || undefined,
        profileImage,
        role: user.role,
        campus: user.campus
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

usersRouter.post("/profile/change-password", async (req: any, res: any) => {
  try {
    const { email, currentPassword, newPassword } = req.body;
    const cleanEmail = email?.toLowerCase().trim();
    const user = await db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(cleanEmail) as any;
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.password !== currentPassword) {
      return res.status(400).json({ error: "Current password does not match" });
    }

    await db.prepare("UPDATE users SET password = ? WHERE id = ?").run(newPassword, user.id);

    // Update password in Supabase Auth
    if (hasSupabaseConfig && cleanEmail) {
      await syncUserToSupabase({
        id: user.id,
        email: cleanEmail,
        password: newPassword,
        displayName: user.displayName,
        role: user.role,
        campus: user.campus
      });
    }

    await logAudit(req, "CHANGE_PASSWORD", `Password changed for user ${cleanEmail} (Supabase Auth updated)`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
