import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT - Mettre à jour la participation au classement
export async function PUT(req: NextRequest) {
  try {
    const { membershipId, participatesInLeaderboard } = await req.json();

    if (!membershipId || participatesInLeaderboard === undefined) {
      return NextResponse.json(
        { error: "membershipId and participatesInLeaderboard are required" },
        { status: 400 }
      );
    }

    const membership = await prisma.membership.update({
      where: { id: membershipId },
      data: { participatesInLeaderboard },
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
