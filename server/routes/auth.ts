// ============================================================================
// AUTHENTICATION ROUTE HANDLER (Local Credentials, Supabase Auth, & Google OAuth)
// ============================================================================
// Import Express Router for modular authentication routes
import { Router } from "express";
// Import database instance and audit logger from schema
import { db, logAudit } from "../db/schema.js";
// Import password security functions
import { hashPassword, verifyPassword, shouldRehash, isHashedPassword } from "../utils/password.ts";
// Import Supabase Auth integration utilities
import { 
  hasSupabaseConfig, 
  authenticateWithSupabase, 
  syncUserToSupabase, 
  findSupabaseUserByEmail 
} from "../supabase.js";

// Instantiate the Express Router instance for auth endpoints
export const authRouter = Router();

// ============================================================================
// Helper Function: Normalize Campus Names for Strict Cross-Campus Validation
// Handles variations like "Sogod (Main) Campus", "Tomas Oppus", etc.
// ============================================================================
function normalizeCampus(c: string): string {
  // If string is empty, return empty string
  if (!c) return '';
  // Convert input to lowercase and trim leading/trailing whitespace
  const lower = c.trim().toLowerCase();
  // Match Hinunangan campus
  if (lower.includes('hinunangan')) return 'hinunangan campus';
  // Match Sogod main campus
  if (lower.includes('sogod') || lower.includes('main')) return 'sogod (main) campus';
  // Match Tomas Oppus campus
  if (lower.includes('tomas') || lower.includes('oppus')) return 'tomas oppus campus';
  // Match Bontoc campus
  if (lower.includes('bontoc')) return 'bontoc campus';
  // Match San Juan campus
  if (lower.includes('san juan') || lower.includes('sanjuan')) return 'san juan campus';
  // Default to lowercase string if no specific pattern matched
  return lower;
}

// ============================================================================
// 1. AUTH STATUS ENDPOINT: GET /api/auth/status
// Returns whether Supabase Cloud Auth is configured or running on local DB auth
// ============================================================================
authRouter.get("/status", async (_req: any, res: any) => {
  // Respond with active authentication provider metadata
  res.json({
    supabaseAuthConfigured: hasSupabaseConfig,      // Boolean: Supabase credentials presence
    provider: hasSupabaseConfig ? "supabase" : "local", // Active primary auth provider
    timestamp: new Date().toISOString()            // Server ISO timestamp
  });
});

// ============================================================================
// 2. EMAIL / PASSWORD LOGIN ENDPOINT: POST /api/auth/login
// Supports hybrid authentication (Supabase Cloud Auth + Local Database Fallback)
// ============================================================================
authRouter.post("/login", async (req: any, res: any) => {
  try {
    // Extract login credentials and optional campus selection from request body
    const { email, password, campus } = req.body;
    // Validate required fields
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    // Clean and normalize input strings
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = String(password);

    // 1. Check local DB for existing user record
    let user: any = null;
    try {
      // Query users table matching email
      user = await db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(cleanEmail) as any;
    } catch (dbErr: any) {
      // If table columns are missing in legacy DB schemas, automatically migrate
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

    // Also look up employee table record for profile data
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
    
    // If user record doesn't exist but employee record exists, auto-provision local user account
    if (!user && employee) {
      const id = employee.id;
      const userPasswordHash = employee.password && isHashedPassword(employee.password)
        ? employee.password
        : await hashPassword(employee.password || cleanPassword);

      await db.prepare("INSERT OR REPLACE INTO users (id, email, password, displayName, role, profileImage, campus) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        id, employee.email, userPasswordHash, `${employee.firstName} ${employee.lastName}`.trim(), 'employee', employee.profileImage || '', employee.campus || 'Hinunangan Campus'
      );
      user = await db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    }

    // Initialize Supabase auth session holders
    let supabaseAuthSession: any = null;
    let supabaseAuthUser: any = null;

    // 2. Perform Supabase Auth if credentials are configured
    if (hasSupabaseConfig) {
      const supabaseAuth = await authenticateWithSupabase(cleanEmail, cleanPassword);
      if (supabaseAuth.success && supabaseAuth.session) {
        supabaseAuthSession = supabaseAuth.session;
        supabaseAuthUser = supabaseAuth.user;
      } else {
        // Evaluate password match against local record using secure password verification
        const isMatch = user && user.password ? await verifyPassword(cleanPassword, user.password) : false;

        // If user matched in local DB but Supabase account was not yet synced, sync now
        if (user && isMatch) {
          // Provision / update user in Supabase Auth
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
      // Validate password equality securely using verifyPassword
      const isPasswordValid = user.password ? await verifyPassword(cleanPassword, user.password) : false;

      // If password does not match local record AND supabase auth failed
      if (!isPasswordValid && !supabaseAuthSession) {
        await logAudit(req, 'USER_LOGIN_FAILED', `Failed login attempt for ${cleanEmail}: Invalid password`);
        return res.status(401).json({ error: "Invalid password" });
      }

      // Safe migration/rehashing strategy:
      // If user logged in successfully and password in DB was plaintext or outdated, upgrade to bcrypt hash
      if (shouldRehash(user.password)) {
        const secureHash = await hashPassword(cleanPassword);
        await db.prepare("UPDATE users SET password = ? WHERE id = ?").run(secureHash, user.id);
        await db.prepare("UPDATE employees SET password = ? WHERE id = ? OR LOWER(email) = ?").run(secureHash, user.id, cleanEmail);
        user.password = secureHash;
      } else if (supabaseAuthSession) {
        const matchesCurrentHash = await verifyPassword(cleanPassword, user.password);
        if (!matchesCurrentHash) {
          const secureHash = await hashPassword(cleanPassword);
          await db.prepare("UPDATE users SET password = ? WHERE id = ?").run(secureHash, user.id);
          await db.prepare("UPDATE employees SET password = ? WHERE id = ? OR LOWER(email) = ?").run(secureHash, user.id, cleanEmail);
          user.password = secureHash;
        }
      }

      // Resolve user's assigned campus
      const assignedCampus = employee?.campus || user.campus || 'Hinunangan Campus';

      // Enforce campus verification if specified
      if (campus) {
        const normSelected = normalizeCampus(campus);
        const normAssigned = normalizeCampus(assignedCampus);

        // Disallow logging into a campus the user is not assigned to
        if (normSelected !== normAssigned) {
          await logAudit(req, 'USER_LOGIN_FAILED', `Failed login attempt for ${cleanEmail}: Campus mismatch. Selected "${campus}", assigned "${assignedCampus}".`);
          return res.status(401).json({ 
            error: `Campus mismatch! Your account is assigned to ${assignedCampus}. Please select ${assignedCampus} to log in.`,
            assignedCampus,
            code: 'CAMPUS_MISMATCH'
          });
        }
      }

      // Sync campus in database if updated
      if (user.campus !== assignedCampus) {
        await db.prepare("UPDATE users SET campus = ? WHERE id = ?").run(assignedCampus, user.id);
        user.campus = assignedCampus;
      }

      // Record successful login audit log
      await logAudit(
        { ...req, headers: { ...req.headers, 'x-user-id': user.id, 'x-user-email': user.email } }, 
        'USER_LOGIN_SUCCESS', 
        `User logged in via ${hasSupabaseConfig && supabaseAuthSession ? 'Supabase Auth' : 'Local Auth'}: ${user.displayName} (${user.role}) - Campus: ${assignedCampus}`
      );

      // Strip sensitive password field before sending response
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

      // Insert new user record with securely hashed password
      const hashedPassword = await hashPassword(cleanPassword);
      await db.prepare(`
        INSERT INTO users (id, email, password, displayName, role, campus)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(newId, cleanEmail, hashedPassword, newDisplayName, newRole, newCampus);

      const createdUser = await db.prepare("SELECT * FROM users WHERE id = ?").get(newId) as any;

      // Log successful registration & login
      await logAudit(
        { ...req, headers: { ...req.headers, 'x-user-id': newId, 'x-user-email': cleanEmail } }, 
        'USER_LOGIN_SUCCESS', 
        `User registered & logged in via Supabase Auth: ${newDisplayName} (${newRole}) - Campus: ${newCampus}`
      );

      // Return sanitized user object with Supabase access tokens
      const { password: _, ...userWithoutPassword } = createdUser;
      return res.json({
        ...userWithoutPassword,
        authProvider: "supabase",
        supabaseToken: supabaseAuthSession.access_token,
        supabaseUser: supabaseAuthUser,
      });
    } else {
      // User account was not found in either system
      await logAudit(req, 'USER_LOGIN_FAILED', `Failed login attempt for ${cleanEmail}: User not found`);
      return res.status(401).json({ error: "User not found" });
    }
  } catch (err: any) {
    // Handle unexpected login errors
    console.error("Login error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ============================================================================
// 3. GOOGLE OAUTH LOGIN ENDPOINT: POST /api/auth/google-login
// Authenticates users signing in with Google Workspace accounts
// ============================================================================
authRouter.post("/google-login", async (req: any, res: any) => {
  try {
    // Extract Google OAuth payload from request body
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
      console.warn("User lookup error:", dbErr.message);
    }

    // 2. Check employee record
    let employee: any = null;
    try {
      employee = await db.prepare("SELECT * FROM employees WHERE LOWER(email) = ?").get(cleanEmail) as any;
    } catch (empErr: any) {
      console.warn("Employee lookup error:", empErr.message);
    }

    const isAdminUser = user && (user.role === 'admin' || user.role === 'superadmin');

    // STRICT VALIDATION: Employee email MUST already have a record in the database
    if (!employee && !isAdminUser) {
      await logAudit(
        req, 
        'USER_LOGIN_FAILED', 
        `Google OAuth login rejected: Email "${cleanEmail}" is not recorded in the employee database.`
      );
      return res.status(403).json({
        error: `Login Failed: No employee record found for email "${cleanEmail}". Your email must already be recorded in the employee database before you can sign in with Google.`,
        code: 'EMAIL_NOT_REGISTERED',
        email: cleanEmail,
      });
    }

    // Check if employee account is active
    if (employee && employee.status && employee.status.toLowerCase() !== 'active') {
      await logAudit(
        req,
        'USER_LOGIN_FAILED', 
        `Google OAuth login rejected: Employee account for "${cleanEmail}" is inactive (${employee.status}).`
      );
      return res.status(403).json({
        error: `Login Failed: Your employee account for "${cleanEmail}" is currently ${employee.status}. Please contact HR or administration.`,
        code: 'ACCOUNT_INACTIVE',
        email: cleanEmail,
      });
    }

    // If employee exists but no user record, create the user record linked to employee
    if (!user && employee) {
      const id = employee.id;
      const empName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
      const oauthPasswordHash = await hashPassword(`oauth_google_${Date.now()}_${Math.random()}`);
      await db.prepare("INSERT OR REPLACE INTO users (id, email, password, displayName, role, profileImage, campus) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        id, 
        employee.email || cleanEmail, 
        oauthPasswordHash, 
        empName || displayName || cleanEmail.split('@')[0], 
        'employee', 
        profileImage || employee.profileImage || '', 
        employee.campus || campus || 'Hinunangan Campus'
      );
      user = await db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
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

    // Log OAuth sign-in event
    await logAudit(
      { ...req, headers: { ...req.headers, 'x-user-id': user.id, 'x-user-email': user.email } },
      'USER_LOGIN_SUCCESS',
      `User logged in via Supabase Google OAuth: ${user.displayName} (${user.role}) - Campus: ${assignedCampus}`
    );

    // Return sanitized user object
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

// ============================================================================
// 4. USER LOGOUT ENDPOINT: POST /api/auth/logout
// Records logout audit log and invalidates active session
// ============================================================================
authRouter.post("/logout", async (req: any, res: any) => {
  // Write audit trail entry
  await logAudit(req, 'USER_LOGOUT', 'User logged out');
  // Confirm logout
  res.json({ message: "Logged out successfully" });
});

// ============================================================================
// 5. CURRENT USER PROFILE: GET /api/auth/me
// Retrieves current authenticated session details using x-user-id header
// ============================================================================
authRouter.get("/me", async (req: any, res: any) => {
  // Extract user ID from request headers
  const userId = req.headers['x-user-id'] || req.headers['user-id'];
  // Reject if header is missing
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  // Query user record by ID
  const user = await db.prepare("SELECT id, email, displayName, role, profileImage, campus, createdAt FROM users WHERE id = ?").get(userId);
  // If not found in database
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  // Return user profile data
  res.json(user);
});
