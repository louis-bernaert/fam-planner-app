import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function generateCode() {
  // Generate a 6-character alphanumeric code
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, userId } = body;

    if (!name || !userId) {
      return NextResponse.json(
        { error: "Name and userId required" },
        { status: 400 }
      );
    }

    // Verify user exists
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!userExists) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Generate code (collision très improbable avec 6 caractères alphanumériques)
    const code = generateCode();

    const family = await (prisma.family.create as any)({
      data: {
        name,
        code,
        members: {
          create: {
            userId,
            role: "admin",
          },
        },
      },
      include: { 
        members: {
          include: { user: true }
        }
      },
    });

    return NextResponse.json(family);
  } catch (error: any) {
    console.error("POST /api/families", error);
    return NextResponse.json(
      { error: "Failed to create family: " + (error?.message || "Unknown error") },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId required" },
        { status: 400 }
      );
    }

    const families = await prisma.family.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      include: {
        members: {
          include: { user: true },
        },
        tasks: true,
      },
    });

    return NextResponse.json(families);
  } catch (error) {
    console.error("GET /api/families", error);
    return NextResponse.json(
      { error: "Failed to fetch families" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name } = body;

    if (!id || !name) {
      return NextResponse.json(
        { error: "id and name required" },
        { status: 400 }
      );
    }

    const family = await prisma.family.update({
      where: { id },
      data: { name },
    });

    return NextResponse.json(family);
  } catch (error) {
    console.error("PUT /api/families", error);
    return NextResponse.json(
      { error: "Failed to update family" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id required" },
        { status: 400 }
      );
    }

    // First delete all related memberships
    await prisma.membership.deleteMany({
      where: { familyId: id },
    });

    // Delete all related tasks and their assignments
    const tasks = await prisma.task.findMany({
      where: { familyId: id },
    });
    
    for (const task of tasks) {
      await prisma.assignment.deleteMany({
        where: { taskId: task.id },
      });
    }
    
    await prisma.task.deleteMany({
      where: { familyId: id },
    });

    // Now delete the family
    await prisma.family.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/families", error);
    return NextResponse.json(
      { error: "Failed to delete family" },
      { status: 500 }
    );
  }
}
