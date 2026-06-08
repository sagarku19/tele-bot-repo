/**
 * Links API — CRUD on the Firestore links collection.
 *
 * GET                           → list all links
 * POST   { name, url, label? }  → create
 * PATCH  { name, url?, label? } → update (name is the doc ID)
 * DELETE ?name=<name>           → delete
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
    const snap = await db.collection("links").get();
    const links = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ links });
  } catch (error) {
    console.error("[Links API GET] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, url, label } = body;
    if (!name || !url) {
      return NextResponse.json({ error: "Missing name or url" }, { status: 400 });
    }

    const db = getDb();
    const ref = db.collection("links").doc(name);
    const existing = await ref.get();
    if (existing.exists) {
      return NextResponse.json({ error: "Link with that name already exists" }, { status: 409 });
    }

    const doc = {
      name,
      url,
      ...(label ? { label } : {}),
      updatedAt: new Date().toISOString(),
    };
    await ref.set(doc);
    return NextResponse.json({ success: true, data: { id: name, ...doc } });
  } catch (error) {
    console.error("[Links API POST] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, ...updates } = body;
    if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

    const db = getDb();
    await db.collection("links").doc(name).set(
      {
        ...updates,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Links API PATCH] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");
    if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

    const db = getDb();
    await db.collection("links").doc(name).delete();
    return NextResponse.json({ success: true, deleted: name });
  } catch (error) {
    console.error("[Links API DELETE] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
