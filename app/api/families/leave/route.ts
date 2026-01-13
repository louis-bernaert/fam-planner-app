import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { familyId, userId } = body;

    if (!familyId || !userId) {
      return NextResponse.json(
        { error: "familyId and userId required" },
        { status: 400 }
      );
    }

    // Delete membership
    await prisma.membership.deleteMany({
      where: {
        familyId,
        userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/families/leave", error);
    return NextResponse.json(
      { error: "Failed to leave family" },
      { status: 500 }
    );
  }
}
