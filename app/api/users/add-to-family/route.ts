import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, firstName, lastName, familyId } = body;

    if (!email || !familyId) {
      return NextResponse.json(
        { error: "Email and familyId required" },
        { status: 400 }
      );
    }

    // Find existing user by email
    let user = await prisma.user.findUnique({
      where: { email },
      include: { memberships: true },
    });

    if (!user) {
      // Create new user if doesn't exist
      user = await prisma.user.create({
        data: {
          email,
          firstName: firstName || "",
          lastName: lastName || "",
          passwordHash: "",
        },
        include: { memberships: true },
      });
    }

    // Check if already member of this family
    const existingMembership = user.memberships.find(
      (m) => m.familyId === familyId
    );

    if (existingMembership) {
      return NextResponse.json(
        { error: "User is already a member of this family" },
        { status: 409 }
      );
    }

    // Create membership
    await prisma.membership.create({
      data: {
        userId: user.id,
        familyId,
        role: "member",
      },
    });

    // Fetch updated user
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { memberships: true },
    });

    return NextResponse.json({
      user: {
        ...updatedUser,
        familyId,
      },
    });
  } catch (error) {
    console.error("POST /api/users/add-to-family", error);
    return NextResponse.json(
      { error: "Failed to add user to family" },
      { status: 500 }
    );
  }
}
