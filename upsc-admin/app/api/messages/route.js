/**
 * Messages API — read a user's chat history (newest-first).
 *
 * GET /api/messages?telegramId=<id>&limit=100&before=<iso-ts>
 *   - telegramId: required
 *   - limit: optional (default 100, max 500)
 *   - before: optional ISO timestamp; returns messages strictly older
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/firebase";

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const telegramId = searchParams.get("telegramId");
    const limitRaw = Number(searchParams.get("limit") || 100);
    const limit = Math.min(Math.max(limitRaw, 1), 500);
    const before = searchParams.get("before");

    if (!telegramId) {
      return NextResponse.json({ error: "Missing telegramId" }, { status: 400 });
    }

    const db = getDb();
    let q = db
      .collection("users")
      .doc(String(telegramId))
      .collection("messages")
      .orderBy("ts", "desc");
    if (before) q = q.where("ts", "<", before);
    q = q.limit(limit);

    const snap = await q.get();
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("[Messages API GET] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
