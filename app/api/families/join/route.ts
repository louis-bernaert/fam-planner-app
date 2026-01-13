import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, userId } = body;

    if (!code || !userId) {
      return NextResponse.json(
        { error: "code and userId required" },
        { status: 400 }
      );
    }

    // Find family by code - get all families and filter in code
    const allFamilies = await prisma.family.findMany();
    const family = (allFamilies as any[]).find(f => f.code === code);

    if (!family) {
      return NextResponse.json(
        { error: "Family code not found" },
        { status: 404 }
      );
    }

    // Check if user already in family
    const existingMembership = await prisma.membership.findFirst({
      where: {
        userId,
        familyId: family.id,
      },
    });

    if (existingMembership) {
      return NextResponse.json(
        { error: "User already member of this family" },
        { status: 400 }
      );
    }

    // Create membership
    const membership = await prisma.membership.create({
      data: {
        userId,
        familyId: family.id,
        role: "member",
      },
      include: { user: true, family: true },
    });

    return NextResponse.json(membership);
  } catch (error) {
    console.error("POST /api/families/join", error);
    return NextResponse.json(
      { error: "Failed to join family" },
      { status: 500 }
    );
  }
}
