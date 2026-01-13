import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId, userId } = body;

    if (!taskId || !userId) {
      return NextResponse.json(
        { error: "taskId and userId required" },
        { status: 400 }
      );
    }

    const assignment = await prisma.assignment.create({
      data: {
        taskId,
        userId,
      },
    });

    return NextResponse.json(assignment);
  } catch (error) {
    console.error("POST /api/assignments", error);
    return NextResponse.json(
      { error: "Failed to create assignment" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    const familyId = req.nextUrl.searchParams.get("familyId");

    let where: any = {};
    if (taskId) {
      where.taskId = taskId;
    }
    if (familyId) {
      where.task = { familyId };
    }

    const assignments = await prisma.assignment.findMany({
      where,
      include: { task: true, user: true },
    });

    return NextResponse.json(assignments);
  } catch (error) {
    console.error("GET /api/assignments", error);
    return NextResponse.json(
      { error: "Failed to fetch assignments" },
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

    await prisma.assignment.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/assignments", error);
    return NextResponse.json(
      { error: "Failed to delete assignment" },
      { status: 500 }
    );
  }
}
