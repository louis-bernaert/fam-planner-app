import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { preferences: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ preferences: user.preferences ?? {} });
  } catch (error) {
    console.error("GET /api/users/[id]/preferences", error);
    return NextResponse.json({ error: "Failed to fetch preferences" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const user = await prisma.user.findUnique({
      where: { id },
      select: { preferences: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const existing = (user.preferences as Record<string, unknown>) ?? {};
    const merged = { ...existing, ...body };

    await prisma.user.update({
      where: { id },
      data: { preferences: merged },
    });

    return NextResponse.json({ preferences: merged });
  } catch (error) {
    console.error("PUT /api/users/[id]/preferences", error);
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
  }
}
