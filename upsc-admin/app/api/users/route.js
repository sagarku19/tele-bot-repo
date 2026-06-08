/**
 * Users API route
 * CRUD operations for bot users
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/firebase";

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const telegramId = searchParams.get("telegramId");

    const db = getDb();

    // Single user lookup by telegramId
    if (telegramId) {
      const doc = await db.collection("users").doc(String(telegramId)).get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const data = doc.data();
      return NextResponse.json({
        user: {
          id: doc.id,
          telegramId: data.telegramId,
          name: data.name,
          username: data.username,
          stage: data.stage,
          isPaid: data.isPaid,
          paidCourseIds: data.paidCourseIds || [],
          createdAt: data.createdAt,
          lastSeen: data.lastSeen,
        },
      });
    }

    // List all users (existing path)
    const snapshot = await db.collection("users").orderBy("createdAt", "desc").limit(100).get();

    const users = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        telegramId: data.telegramId,
        name: data.name,
        username: data.username,
        stage: data.stage,
        isPaid: data.isPaid,
        paidCourseIds: data.paidCourseIds || [],
        createdAt: data.createdAt,
        lastSeen: data.lastSeen,
      };
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("[Users API GET] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
