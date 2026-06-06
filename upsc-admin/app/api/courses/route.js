/**
 * Courses API route
 * CRUD operations for bot courses
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/firebase";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();
    const snapshot = await db.collection("courses").get();
    const courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ courses });
  } catch (error) {
    console.error("[Courses API GET] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, description, price, channelId, groupId, welcomeMessage } = body;
    
    if (!name) {
      return NextResponse.json({ error: "Missing required field: name" }, { status: 400 });
    }

    const db = getDb();
    const courseData = {
      name, 
      description: description || "", 
      price: Number(price) || 0, 
      channelId: channelId || "", 
      groupId: groupId || "", 
      welcomeMessage: welcomeMessage || "",
      active: true,
      createdAt: new Date().toISOString()
    };
    
    const docRef = await db.collection("courses").add(courseData);
    return NextResponse.json({ success: true, data: { id: docRef.id, ...courseData } });
  } catch (error) {
    console.error("[Courses API POST] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: "Missing course id" }, { status: 400 });

    const db = getDb();
    await db.collection("courses").doc(id).update(updates);

    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    console.error("[Courses API PATCH] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Missing course id" }, { status: 400 });

    const db = getDb();
    await db.collection("courses").doc(id).update({ active: false });

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error("[Courses API DELETE] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
