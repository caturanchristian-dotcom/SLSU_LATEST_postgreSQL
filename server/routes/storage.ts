import { Router } from "express";
import { 
  uploadImageToSupabase, 
  deleteImageFromSupabase,
  getStorageStatus, 
  migrateBase64ImagesToSupabase,
  ensureStorageBucketExists,
  DEFAULT_STORAGE_BUCKET
} from "../supabase.js";
import { logAudit } from "../db/schema.js";

export const storageRouter = Router();

// Upload image to Supabase Storage (with automatic deletion of old image if provided)
storageRouter.post("/storage/upload", async (req: any, res: any) => {
  try {
    const { image, filename, folder, bucket, oldImage } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Missing required 'image' data (base64 string or URL)" });
    }

    const result = await uploadImageToSupabase(image, {
      filename,
      folder: folder || "uploads",
      bucket: bucket || DEFAULT_STORAGE_BUCKET,
      oldImageUrl: oldImage,
    });

    if (!result.success) {
      // If Supabase upload fails (e.g. not configured), return message with fallback if base64
      return res.status(result.error?.includes("not configured") ? 200 : 500).json({
        success: result.success,
        publicUrl: result.publicUrl || image,
        warning: result.error,
      });
    }

    res.json({
      success: true,
      publicUrl: result.publicUrl,
      path: result.path,
    });
  } catch (err: any) {
    console.error("[Storage Router] Upload error:", err);
    res.status(500).json({ error: err.message || "Failed to upload image to Supabase Storage" });
  }
});

// Delete image from Supabase Storage
storageRouter.post("/storage/delete", async (req: any, res: any) => {
  try {
    const { image, bucket } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Missing required 'image' parameter" });
    }
    const result = await deleteImageFromSupabase(image, bucket || DEFAULT_STORAGE_BUCKET);
    res.json(result);
  } catch (err: any) {
    console.error("[Storage Router] Delete error:", err);
    res.status(500).json({ error: err.message || "Failed to delete image from Supabase Storage" });
  }
});

// Check Supabase Storage status
storageRouter.get("/storage/status", async (req: any, res: any) => {
  try {
    const status = await getStorageStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Ensure Supabase Storage bucket is initialized
storageRouter.post("/storage/ensure-bucket", async (req: any, res: any) => {
  try {
    const { bucket } = req.body;
    const ok = await ensureStorageBucketExists(bucket || DEFAULT_STORAGE_BUCKET);
    res.json({ success: ok, bucketName: bucket || DEFAULT_STORAGE_BUCKET });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Migrate any existing base64 images in database to Supabase Storage
storageRouter.post("/storage/migrate-all", async (req: any, res: any) => {
  try {
    const { bucket } = req.body;
    const results = await migrateBase64ImagesToSupabase(bucket || DEFAULT_STORAGE_BUCKET);
    
    await logAudit(
      req, 
      "MIGRATE_IMAGES_SUPABASE", 
      `Migrated ${results.employeesMigrated} employee images and ${results.usersMigrated} user avatars to Supabase Storage`
    );

    res.json({
      success: true,
      ...results,
    });
  } catch (err: any) {
    console.error("[Storage Router] Migration error:", err);
    res.status(500).json({ error: err.message || "Failed to migrate images to Supabase" });
  }
});
