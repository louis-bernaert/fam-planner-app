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
      include: {
        memberships: {
          include: { family: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...user,
      familyId: user.memberships[0]?.familyId || null,
      isAdmin: user.memberships[0]?.role === "admin",
    });
  } catch (error) {
    console.error("GET /api/users/[id]", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { firstName, lastName, email, password, name } = body;

    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (name !== undefined) updateData.name = name;
    if (password) updateData.passwordHash = password; // Note: should be hashed in production

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        memberships: true,
      },
    });

    return NextResponse.json({
      ...updatedUser,
      familyId: updatedUser.memberships[0]?.familyId || null,
    });
  } catch (error) {
    console.error("PUT /api/users/[id]", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Delete memberships first
    await prisma.membership.deleteMany({
      where: { userId: id },
    });

    // Delete user
    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/users/[id]", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
