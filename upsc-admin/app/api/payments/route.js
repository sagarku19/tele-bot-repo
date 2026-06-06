/**
 * Payments API route
 * Query and manage payment records
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
    const statusFilter = searchParams.get("status");

    const db = getDb();
    let query = db.collection("payments").orderBy("createdAt", "desc");
    
    if (statusFilter && ["pending", "verified", "rejected"].includes(statusFilter)) {
      query = db.collection("payments").where("status", "==", statusFilter).orderBy("createdAt", "desc");
    }

    const snapshot = await query.get();
    const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ payments });
  } catch (error) {
    console.error("[Payments API GET] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { paymentId, status } = await request.json();
    if (!paymentId || !status) {
      return NextResponse.json({ error: "Missing paymentId or status" }, { status: 400 });
    }

    const db = getDb();
    const updateData = { status };
    if (status === "verified") {
      updateData.verifiedAt = new Date().toISOString();
      console.log(`TODO: trigger bot access grant for payment ${paymentId}`);
    }

    await db.collection("payments").doc(paymentId).update(updateData);

    return NextResponse.json({ success: true, paymentId, status });
  } catch (error) {
    console.error("[Payments API PATCH] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
