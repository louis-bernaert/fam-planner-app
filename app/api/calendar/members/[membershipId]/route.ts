import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> }
) {
  try {
    const { membershipId } = await params;
    const body = await req.json();
    const { color, calendarUrl } = body;

    const updateData: any = {};
    if (color !== undefined) updateData.color = color;
    if (calendarUrl !== undefined) updateData.calendarUrl = calendarUrl;

    const updated = await prisma.membership.update({
      where: { id: membershipId },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("PATCH /api/calendar/members/[membershipId]", error);
    return NextResponse.json(
      { error: "Failed to update member: " + (error?.message || "Unknown error") },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> }
) {
  try {
    const { membershipId } = await params;

    const membership = await prisma.membership.findUnique({
      where: { id: membershipId },
      include: { user: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Membership not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: membership.userId,
      membershipId: membership.id,
      name: membership.user.name,
      email: membership.user.email,
      color: membership.color || "#3b82f6",
      calendarUrl: membership.calendarUrl || "",
      role: membership.role,
    });
  } catch (error: any) {
    console.error("GET /api/calendar/members/[membershipId]", error);
    return NextResponse.json(
      { error: "Failed to fetch member: " + (error?.message || "Unknown error") },
      { status: 500 }
    );
  }
}
