// ============================================================================
// STORAGE ROUTE HANDLER (Supabase Cloud Storage & Image Management API)
// ============================================================================
// Import Express Router for modular routing
import { Router } from "express";
// Import Supabase storage helper functions for uploading, deleting, and migrating assets
import { 
  uploadImageToSupabase, 
  deleteImageFromSupabase,
  getStorageStatus, 
  migrateBase64ImagesToSupabase,
  ensureStorageBucketExists,
  DEFAULT_STORAGE_BUCKET
} from "../supabase.js";
// Import audit logging utility for security compliance tracking
import { logAudit } from "../db/schema.js";

// Instantiate the Express Router instance for storage endpoints
export const storageRouter = Router();

// ============================================================================
// 1. UPLOAD IMAGE ENDPOINT: /api/storage/upload
// Accepts base64 encoded data URI or URL and stores it in Supabase Storage bucket
// ============================================================================
storageRouter.post("/storage/upload", async (req: any, res: any) => {
  try {
    // Extract request body parameters (image data, filename, destination folder, bucket, old image URL)
    const { image, filename, folder, bucket, oldImage } = req.body;

    // Validate that image payload is provided
    if (!image) {
      return res.status(400).json({ error: "Missing required 'image' data (base64 string or URL)" });
    }

    // Call Supabase upload helper with options and automatic cleanup of previous image
    const result = await uploadImageToSupabase(image, {
      filename,                                   // Custom file name or generated timestamp
      folder: folder || "uploads",                // Target directory in bucket (e.g. avatars, employees)
      bucket: bucket || DEFAULT_STORAGE_BUCKET,   // Storage bucket name
      oldImageUrl: oldImage,                      // If provided, the old image file is automatically deleted
    });

    // If upload was unsuccessful (e.g., Supabase not configured in local development)
    if (!result.success) {
      // Return 200 with fallback to raw base64 or 500 error depending on failure reason
      return res.status(result.error?.includes("not configured") ? 200 : 500).json({
        success: result.success,                  // Success flag (boolean)
        publicUrl: result.publicUrl || image,     // Fallback to provided image data
        warning: result.error,                    // Warning message explaining why cloud upload was skipped
      });
    }

    // Return successful response containing the public CDN URL and storage path
    res.json({
      success: true,                              // Indicates successful upload
      publicUrl: result.publicUrl,                // Direct HTTPS public URL of uploaded image
      path: result.path,                          // File path inside the Supabase Storage bucket
    });
  } catch (err: any) {
    // Catch any unexpected exceptions and log to console
    console.error("[Storage Router] Upload error:", err);
    // Return HTTP 500 Internal Server Error
    res.status(500).json({ error: err.message || "Failed to upload image to Supabase Storage" });
  }
});

// ============================================================================
// 2. DELETE IMAGE ENDPOINT: /api/storage/delete
// Deletes a specific image asset from Supabase Storage by public URL or path
// ============================================================================
storageRouter.post("/storage/delete", async (req: any, res: any) => {
  try {
    // Extract target image URL and optional bucket name from request body
    const { image, bucket } = req.body;
    // Validate required parameter
    if (!image) {
      return res.status(400).json({ error: "Missing required 'image' parameter" });
    }
    // Perform deletion using the Supabase storage helper
    const result = await deleteImageFromSupabase(image, bucket || DEFAULT_STORAGE_BUCKET);
    // Return operation outcome
    res.json(result);
  } catch (err: any) {
    // Log deletion error to server console
    console.error("[Storage Router] Delete error:", err);
    // Send HTTP 500 status code with error message
    res.status(500).json({ error: err.message || "Failed to delete image from Supabase Storage" });
  }
});

// ============================================================================
// 3. STORAGE STATUS ENDPOINT: /api/storage/status
// Checks connectivity to Supabase Storage bucket and returns configuration status
// ============================================================================
storageRouter.get("/storage/status", async (req: any, res: any) => {
  try {
    // Query storage status (checks bucket existence, permissions, and connectivity)
    const status = await getStorageStatus();
    // Return status object to client
    res.json(status);
  } catch (err: any) {
    // Return HTTP 500 on failure
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 4. ENSURE BUCKET EXISTS ENDPOINT: /api/storage/ensure-bucket
// Creates or verifies the public storage bucket in Supabase if it does not exist
// ============================================================================
storageRouter.post("/storage/ensure-bucket", async (req: any, res: any) => {
  try {
    // Extract bucket name from request body
    const { bucket } = req.body;
    // Invoke bucket initialization check
    const ok = await ensureStorageBucketExists(bucket || DEFAULT_STORAGE_BUCKET);
    // Respond with success flag and bucket identifier
    res.json({ success: ok, bucketName: bucket || DEFAULT_STORAGE_BUCKET });
  } catch (err: any) {
    // Return HTTP 500 on failure
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 5. MIGRATE ALL BASE64 IMAGES: /api/storage/migrate-all
// Scans database for embedded base64 images and uploads them to Supabase Storage
// ============================================================================
storageRouter.post("/storage/migrate-all", async (req: any, res: any) => {
  try {
    // Extract target bucket name
    const { bucket } = req.body;
    // Run migration utility across employees and users tables
    const results = await migrateBase64ImagesToSupabase(bucket || DEFAULT_STORAGE_BUCKET);
    
    // Log audit action for migration execution
    await logAudit(
      req, 
      "MIGRATE_IMAGES_SUPABASE", 
      `Migrated ${results.employeesMigrated} employee images and ${results.usersMigrated} user avatars to Supabase Storage`
    );

    // Return complete migration metrics
    res.json({
      success: true,
      ...results,
    });
  } catch (err: any) {
    // Log migration failure to console
    console.error("[Storage Router] Migration error:", err);
    // Return HTTP 500 on failure
    res.status(500).json({ error: err.message || "Failed to migrate images to Supabase" });
  }
});
