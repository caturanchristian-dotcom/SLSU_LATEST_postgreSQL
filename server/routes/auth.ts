import { Router } from "express";
import { db, logAudit } from "../db/schema.js";
import { 
  hasSupabaseConfig, 
  authenticateWithSupabase, 
  syncUserToSupabase, 
  findSupabaseUserByEmail 
} from "../supabase.js";

export const authRouter = Router();

function normalizeCampus(c: string): string {
  if (!c) return '';
  const lower = c.trim().toLowerCase();
  if (lower.includes('hinunangan')) return 'hinunangan campus';
  if (lower.includes('sogod') || lower.includes('main')) return 'sogod (main) campus';
  if (lower.includes('tomas') || lower.includes('oppus')) return 'tomas oppus campus';
  if (lower.includes('bontoc')) return 'bontoc campus';
  if (lower.includes('san juan') || lower.includes('sanjuan')) return 'san juan campus';
  return lower;
}

authRouter.get("/status", async (_req: any, res: any) => {
  res.json({
    supabaseAuthConfigured: hasSupabaseConfig,
    provider: hasSupabaseConfig ? "supabase" : "local",
    timestamp: new Date().toISOString()
  });
});

authRouter.post("/login", async (req: any, res: any) => {
  try {
    const { email, password, campus } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = String(password);

    // 1. Check local DB user & employee
    let user: any = null;
    try {
      user = await db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(cleanEmail) as any;
    } catch (dbErr: any) {
      if (dbErr.message?.includes("email") || dbErr.message?.includes("does not exist")) {
        try {
          await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(191)");
          await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT");
          await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS \"displayName\" TEXT");
          user = await db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(cleanEmail) as any;
        } catch {}
      } else {
        throw dbErr;
      }
    }

    let employee: any = null;
    try {
      employee = await db.prepare("SELECT * FROM employees WHERE LOWER(email) = ?").get(cleanEmail) as any;
    } catch (empErr: any) {
      if (empErr.message?.includes("email") || empErr.message?.includes("does not exist")) {
        try {
          await db.exec("ALTER TABLE employees ADD COLUMN IF NOT EXISTS email TEXT");
          employee = await db.prepare("SELECT * FROM employees WHERE LOWER(email) = ?").get(cleanEmail) as any;
        } catch {}
      }
    }
    
    if (!user && employee) {
      const id = employee.id;
      await db.prepare("INSERT OR REPLACE INTO users (id, email, password, displayName, role, profileImage, campus) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        id, employee.email, employee.password || cleanPassword, `${employee.firstName} ${employee.lastName}`.trim(), 'employee', employee.profileImage || '', employee.campus || 'Hinunangan Campus'
      );
      user = await db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    }

    let supabaseAuthSession: any = null;
    let supabaseAuthUser: any = null;

    // 2. Perform Supabase Auth if Supabase is configured
    if (hasSupabaseConfig) {
      const supabaseAuth = await authenticateWithSupabase(cleanEmail, cleanPassword);
      if (supabaseAuth.success && supabaseAuth.session) {
        supabaseAuthSession = supabaseAuth.session;
        supabaseAuthUser = supabaseAuth.user;
      } else {
        // If Supabase Auth failed because user was not yet synced or password changed in local DB:
        if (user && user.password === cleanPassword) {
          // Provision / update in Supabase Auth
          await syncUserToSupabase({
            id: user.id,
            email: cleanEmail,
            password: cleanPassword,
            displayName: user.displayName,
            role: user.role,
            campus: user.campus,
            profileImage: user.profileImage,
          });

          // Re-try Supabase Auth sign-in
          const retryAuth = await authenticateWithSupabase(cleanEmail, cleanPassword);
          if (retryAuth.success && retryAuth.session) {
            supabaseAuthSession = retryAuth.session;
            supabaseAuthUser = retryAuth.user;
          }
        }
      }
    }

    // 3. Verify user authentication status
    if (user) {
      // If password does not match local record AND supabase auth failed
      if (user.password !== cleanPassword && !supabaseAuthSession) {
        await logAudit(req, 'USER_LOGIN_FAILED', `Failed login attempt for ${cleanEmail}: Invalid password`);
        return res.status(401).json({ error: "Invalid password" });
      }

      // If user logged in via Supabase Auth successfully but password in local DB was outdated, update DB
      if (supabaseAuthSession && user.password !== cleanPassword) {
        await db.prepare("UPDATE users SET password = ? WHERE id = ?").run(cleanPassword, user.id);
        user.password = cleanPassword;
      }

      const assignedCampus = employee?.campus || user.campus || 'Hinunangan Campus';

      if (campus) {
        const normSelected = normalizeCampus(campus);
        const normAssigned = normalizeCampus(assignedCampus);

        if (normSelected !== normAssigned) {
          await logAudit(req, 'USER_LOGIN_FAILED', `Failed login attempt for ${cleanEmail}: Campus mismatch. Selected "${campus}", assigned "${assignedCampus}".`);
          return res.status(401).json({ 
            error: `Campus mismatch! Your account is assigned to ${assignedCampus}. Please select ${assignedCampus} to log in.`,
            assignedCampus,
            code: 'CAMPUS_MISMATCH'
          });
        }
      }

      if (user.campus !== assignedCampus) {
        await db.prepare("UPDATE users SET campus = ? WHERE id = ?").run(assignedCampus, user.id);
        user.campus = assignedCampus;
      }

      await logAudit(
        { ...req, headers: { ...req.headers, 'x-user-id': user.id, 'x-user-email': user.email } }, 
        'USER_LOGIN_SUCCESS', 
        `User logged in via ${hasSupabaseConfig && supabaseAuthSession ? 'Supabase Auth' : 'Local Auth'}: ${user.displayName} (${user.role}) - Campus: ${assignedCampus}`
      );

      const { password: _, ...userWithoutPassword } = user;
      return res.json({ 
        ...userWithoutPassword, 
        campus: assignedCampus,
        authProvider: hasSupabaseConfig ? "supabase" : "local",
        supabaseToken: supabaseAuthSession?.access_token || null,
        supabaseUser: supabaseAuthUser || null,
      });
    } else if (supabaseAuthSession && supabaseAuthUser) {
      // User authenticated via Supabase but not yet in local DB: Create user in local DB
      const meta = supabaseAuthUser.user_metadata || {};
      const newId = meta.db_id || `user-${Date.now()}`;
      const newDisplayName = meta.displayName || cleanEmail.split('@')[0];
      const newRole = meta.role || 'employee';
      const newCampus = meta.campus || 'Hinunangan Campus';

      await db.prepare(`
        INSERT INTO users (id, email, password, displayName, role, campus)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(newId, cleanEmail, cleanPassword, newDisplayName, newRole, newCampus);

      const createdUser = await db.prepare("SELECT * FROM users WHERE id = ?").get(newId) as any;

      await logAudit(
        { ...req, headers: { ...req.headers, 'x-user-id': newId, 'x-user-email': cleanEmail } }, 
        'USER_LOGIN_SUCCESS', 
        `User registered & logged in via Supabase Auth: ${newDisplayName} (${newRole}) - Campus: ${newCampus}`
      );

      const { password: _, ...userWithoutPassword } = createdUser;
      return res.json({
        ...userWithoutPassword,
        authProvider: "supabase",
        supabaseToken: supabaseAuthSession.access_token,
        supabaseUser: supabaseAuthUser,
      });
    } else {
      await logAudit(req, 'USER_LOGIN_FAILED', `Failed login attempt for ${cleanEmail}: User not found`);
      return res.status(401).json({ error: "User not found" });
    }
  } catch (err: any) {
    console.error("Login error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

authRouter.post("/google-login", async (req: any, res: any) => {
  try {
    const { email, displayName, profileImage, campus, supabaseToken, supabaseUser } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required for Google authentication" });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Check local DB user
    let user: any = null;
    try {
      user = await db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(cleanEmail) as any;
    } catch (dbErr: any) {
      if (dbErr.message?.includes("email") || dbErr.message?.includes("does not exist")) {
        try {
          await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(191)");
          await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT");
          await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS \"displayName\" TEXT");
          await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS profileImage TEXT");
          await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS campus TEXT");
          user = await db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(cleanEmail) as any;
        } catch {}
      }
    }

    // 2. Check employee record
    let employee: any = null;
    try {
      employee = await db.prepare("SELECT * FROM employees WHERE LOWER(email) = ?").get(cleanEmail) as any;
    } catch (empErr: any) {
      if (empErr.message?.includes("email") || empErr.message?.includes("does not exist")) {
        try {
          await db.exec("ALTER TABLE employees ADD COLUMN IF NOT EXISTS email TEXT");
          employee = await db.prepare("SELECT * FROM employees WHERE LOWER(email) = ?").get(cleanEmail) as any;
        } catch {}
      }
    }

    // If employee exists but no user record, create the user record
    if (!user && employee) {
      const id = employee.id;
      const empName = `${employee.firstName} ${employee.lastName}`.trim();
      await db.prepare("INSERT OR REPLACE INTO users (id, email, password, displayName, role, profileImage, campus) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        id, employee.email, `oauth_google_${Date.now()}`, empName || displayName || cleanEmail.split('@')[0], 'employee', profileImage || employee.profileImage || '', employee.campus || campus || 'Hinunangan Campus'
      );
      user = await db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    }

    // If still no user, auto-provision user record
    if (!user) {
      const isSuperAdmin = cleanEmail === 'caturanchristian@gmail.com' || cleanEmail.includes('admin');
      const newId = `user-${Date.now()}`;
      const newDisplayName = displayName || cleanEmail.split('@')[0];
      const newRole = isSuperAdmin ? 'admin' : 'employee';
      const assignedCampus = campus || 'Hinunangan Campus';

      await db.prepare(`
        INSERT INTO users (id, email, password, displayName, role, profileImage, campus)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(newId, cleanEmail, `oauth_google_${Date.now()}`, newDisplayName, newRole, profileImage || '', assignedCampus);

      user = await db.prepare("SELECT * FROM users WHERE id = ?").get(newId) as any;
    }

    // Update profile image from Google if not set
    if (profileImage && (!user.profileImage || user.profileImage.startsWith('http'))) {
      try {
        await db.prepare("UPDATE users SET profileImage = ? WHERE id = ?").run(profileImage, user.id);
        user.profileImage = profileImage;
      } catch {}
    }

    const assignedCampus = employee?.campus || user.campus || campus || 'Hinunangan Campus';

    // Verify campus if specified
    if (campus && user.role !== 'admin') {
      const normSelected = normalizeCampus(campus);
      const normAssigned = normalizeCampus(assignedCampus);

      if (normSelected !== normAssigned) {
        await logAudit(req, 'USER_LOGIN_FAILED', `Google OAuth login attempt for ${cleanEmail}: Campus mismatch. Selected "${campus}", assigned "${assignedCampus}".`);
        return res.status(401).json({
          error: `Campus mismatch! Your account is assigned to ${assignedCampus}. Please select ${assignedCampus} to log in.`,
          assignedCampus,
          code: 'CAMPUS_MISMATCH'
        });
      }
    }

    await logAudit(
      { ...req, headers: { ...req.headers, 'x-user-id': user.id, 'x-user-email': user.email } },
      'USER_LOGIN_SUCCESS',
      `User logged in via Supabase Google OAuth: ${user.displayName} (${user.role}) - Campus: ${assignedCampus}`
    );

    const { password: _, ...userWithoutPassword } = user;
    return res.json({
      ...userWithoutPassword,
      campus: assignedCampus,
      authProvider: "supabase",
      supabaseToken: supabaseToken || null,
      supabaseUser: supabaseUser || null,
    });
  } catch (err: any) {
    console.error("Google login error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

authRouter.post("/logout", async (req: any, res: any) => {
  await logAudit(req, 'USER_LOGOUT', 'User logged out');
  res.json({ message: "Logged out successfully" });
});

authRouter.get("/me", async (req: any, res: any) => {
  const userId = req.headers['x-user-id'] || req.headers['user-id'];
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const user = await db.prepare("SELECT id, email, displayName, role, profileImage, campus, createdAt FROM users WHERE id = ?").get(userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(user);
});
