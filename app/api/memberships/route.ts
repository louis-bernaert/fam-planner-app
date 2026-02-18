import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, familyId, role = "member" } = body;

    if (!userId || !familyId) {
      return NextResponse.json(
        { error: "userId and familyId required" },
        { status: 400 }
      );
    }

    const membership = await prisma.membership.create({
      data: {
        userId,
        familyId,
        role,
      },
      include: { user: true, family: true },
    });

    return NextResponse.json(membership);
  } catch (error) {
    console.error("POST /api/memberships", error);
    return NextResponse.json(
      { error: "Failed to create membership" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const familyId = req.nextUrl.searchParams.get("familyId");
    const userId = req.nextUrl.searchParams.get("userId");

    let where: any = {};
    if (familyId) where.familyId = familyId;
    if (userId) where.userId = userId;

    const memberships = await prisma.membership.findMany({
      where,
      include: { user: true, family: true },
    });

    return NextResponse.json(memberships);
  } catch (error) {
    console.error("GET /api/memberships", error);
    return NextResponse.json(
      { error: "Failed to fetch memberships" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { membershipId, role, requesterId } = await req.json();

    if (!membershipId || !role || !requesterId) {
      return NextResponse.json(
        { error: "membershipId, role, and requesterId are required" },
        { status: 400 }
      );
    }

    if (!["admin", "member"].includes(role)) {
      return NextResponse.json(
        { error: "Role must be 'admin' or 'member'" },
        { status: 400 }
      );
    }

    // Verify requester is admin of the same family
    const targetMembership = await prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!targetMembership) {
      return NextResponse.json(
        { error: "Membership not found" },
        { status: 404 }
      );
    }

    const requesterMembership = await prisma.membership.findFirst({
      where: {
        userId: requesterId,
        familyId: targetMembership.familyId,
        role: "admin",
      },
    });

    if (!requesterMembership) {
      return NextResponse.json(
        { error: "Seuls les administrateurs peuvent modifier les rôles" },
        { status: 403 }
      );
    }

    const updated = await prisma.membership.update({
      where: { id: membershipId },
      data: { role },
      include: { user: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/memberships", error);
    return NextResponse.json(
      { error: "Failed to update membership" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    const familyId = req.nextUrl.searchParams.get("familyId");
    const id = req.nextUrl.searchParams.get("id");

    let whereClause: any = {};
    
    if (id) {
      whereClause.id = id;
    } else if (userId && familyId) {
      whereClause.userId = userId;
      whereClause.familyId = familyId;
    } else {
      return NextResponse.json(
        { error: "id or (userId and familyId) required" },
        { status: 400 }
      );
    }

    await prisma.membership.deleteMany({
      where: whereClause,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/memberships", error);
    return NextResponse.json(
      { error: "Failed to delete membership" },
      { status: 500 }
    );
  }
}
