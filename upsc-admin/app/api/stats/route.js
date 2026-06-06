/**
 * Stats API route
 * Returns dashboard statistics (user count, revenue, etc.)
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/firebase";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const usersSnapshot = await db.collection("users").get();
    const coursesSnapshot = await db.collection("courses").get();

    let totalUsers = 0;
    let paidUsers = 0;
    let todayNewUsers = 0;
    let totalRevenue = 0;
    let stageBreakdown = { new: 0, engaged: 0, interested: 0, payment_pending: 0, paid: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    usersSnapshot.forEach((doc) => {
      const data = doc.data();
      totalUsers++;
      
      if (data.isPaid) paidUsers++;
      
      if (data.createdAt) {
        const createdAt = new Date(data.createdAt);
        if (createdAt >= today) todayNewUsers++;
      }
      
      const stage = data.stage || "new";
      if (stageBreakdown[stage] !== undefined) {
        stageBreakdown[stage]++;
      } else {
        stageBreakdown[stage] = 1;
      }
    });

    let totalCoursePrice = 0;
    let courseCount = 0;
    coursesSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.price) {
        totalCoursePrice += data.price;
        courseCount++;
      }
    });

    const averageCoursePrice = courseCount > 0 ? totalCoursePrice / courseCount : 0;
    totalRevenue = paidUsers * averageCoursePrice;

    return NextResponse.json({
      totalUsers,
      paidUsers,
      todayNewUsers,
      totalRevenue,
      stageBreakdown,
    });
  } catch (error) {
    console.error("[Stats API] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
