import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Get members with their calendar settings
export async function GET(req: NextRequest) {
  try {
    const familyId = req.nextUrl.searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json(
        { error: "familyId required" },
        { status: 400 }
      );
    }

    const memberships = await prisma.membership.findMany({
      where: { familyId },
      include: { user: true },
    });

    const members = memberships.map((m: any) => ({
      id: m.userId,
      membershipId: m.id,
      name: m.user.name,
      email: m.user.email,
      color: m.color || "#3b82f6",
      calendarUrl: m.calendarUrl || "",
      role: m.role,
    }));

    return NextResponse.json(members);
  } catch (error: any) {
    console.error("GET /api/calendar/members", error);
    return NextResponse.json(
      { error: "Failed to fetch members: " + (error?.message || "Unknown error") },
      { status: 500 }
    );
  }
}

// Update member calendar settings
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { membershipId, color, calendarUrl } = body;

    if (!membershipId) {
      return NextResponse.json(
        { error: "membershipId required" },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (color) updateData.color = color;
    if (calendarUrl !== undefined) updateData.calendarUrl = calendarUrl;

    const updated = await prisma.membership.update({
      where: { id: membershipId },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("PUT /api/calendar/members", error);
    return NextResponse.json(
      { error: "Failed to update member: " + (error?.message || "Unknown error") },
      { status: 500 }
    );
  }
}
