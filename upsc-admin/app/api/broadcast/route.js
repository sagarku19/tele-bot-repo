/**
 * Broadcast API route
 * Send messages to bot users via Telegram
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/firebase";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { message, targetStage } = await request.json();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
      return NextResponse.json({ error: "Bot token not configured" }, { status: 500 });
    }

    const db = getDb();
    let query = db.collection("users");
    
    if (targetStage && targetStage !== "all") {
      query = query.where("stage", "==", targetStage);
    }
    
    const snapshot = await query.get();
    
    let sent = 0;
    let failed = 0;

    for (const doc of snapshot.docs) {
      const user = doc.data();
      if (!user.telegramId) continue;
      
      try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: user.telegramId,
            text: message,
          }),
        });
        
        if (response.ok) {
          sent++;
        } else {
          failed++;
        }
      } catch (err) {
        console.error(`Failed to send to ${user.telegramId}:`, err);
        failed++;
      }
      
      // Rate limiting: sleep 50ms between each message to avoid flooding Telegram API
      await sleep(50);
    }

    return NextResponse.json({
      success: true,
      message: "Broadcast completed",
      targetStage: targetStage || "all",
      sent,
      failed
    });
  } catch (error) {
    console.error("[Broadcast API POST] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
