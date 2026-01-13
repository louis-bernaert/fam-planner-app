import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const family = await prisma.family.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: true },
        },
      },
    });

    if (!family) {
      return NextResponse.json(
        { error: "Family not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(family);
  } catch (error) {
    console.error("GET /api/families/[id]", error);
    return NextResponse.json(
      { error: "Failed to fetch family" },
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
    const { name } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;

    const updatedFamily = await prisma.family.update({
      where: { id },
      data: updateData,
      include: {
        members: {
          include: { user: true },
        },
      },
    });

    return NextResponse.json(updatedFamily);
  } catch (error) {
    console.error("PUT /api/families/[id]", error);
    return NextResponse.json(
      { error: "Failed to update family" },
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

    // Delete all memberships first
    await prisma.membership.deleteMany({
      where: { familyId: id },
    });

    // Delete all tasks
    await prisma.task.deleteMany({
      where: { familyId: id },
    });

    // Delete family
    await prisma.family.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/families/[id]", error);
    return NextResponse.json(
      { error: "Failed to delete family" },
      { status: 500 }
    );
  }
}
