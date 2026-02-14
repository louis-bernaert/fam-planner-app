import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT - Mettre à jour la participation (classement ou auto-attribution)
export async function PUT(req: NextRequest) {
  try {
    const { membershipId, participatesInLeaderboard, participatesInAutoAssign } = await req.json();

    if (!membershipId) {
      return NextResponse.json(
        { error: "membershipId is required" },
        { status: 400 }
      );
    }

    const data: Record<string, boolean> = {};
    if (participatesInLeaderboard !== undefined) {
      data.participatesInLeaderboard = participatesInLeaderboard;
    }
    if (participatesInAutoAssign !== undefined) {
      data.participatesInAutoAssign = participatesInAutoAssign;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "At least one field to update is required" },
        { status: 400 }
      );
    }

    const membership = await prisma.membership.update({
      where: { id: membershipId },
      data,
    });

    return NextResponse.json(membership);
  } catch (error: any) {
    console.error("PUT /api/settings/points/participation", error);
    return NextResponse.json(
      { error: "Failed to update participation" },
      { status: 500 }
    );
  }
}
