import { refreshAllCaches } from "../../lib/cache";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return res.status(500).json({ error: "CRON_SECRET is not configured" });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await refreshAllCaches();
    return res.status(200).json({
      ok: true,
      message: "Weekly event cache refresh complete",
      ...result,
    });
  } catch (err) {
    console.error("Cron refresh error:", err);
    return res.status(500).json({ error: err.message || "Cron refresh failed" });
  }
}
