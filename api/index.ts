import app, { ensureDbInitialized } from "../server/index.js";

export default async function handler(req: any, res: any) {
  try {
    await ensureDbInitialized();
    return app(req, res);
  } catch (error: any) {
    console.error("[Vercel Serverless Function Error]:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: error?.message || "Failed to process request",
    });
  }
}
