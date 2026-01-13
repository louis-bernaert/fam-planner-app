import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, duration, penibility, slot, schedules, familyId } = body;

    if (!title || !familyId) {
      return NextResponse.json(
        { error: "title and familyId required. Got: title=" + title + ", familyId=" + familyId },
        { status: 400 }
      );
    }

    // Verify family exists
    const familyExists = await prisma.family.findUnique({
      where: { id: familyId },
    });

    if (!familyExists) {
      return NextResponse.json(
        { error: "Family not found: " + familyId },
        { status: 404 }
      );
    }

    const task = await prisma.task.create({
      data: {
        title,
        duration: duration || 30,
        penibility: penibility || 30,
        slot: slot || "Lun · Matin",
        frequency: JSON.stringify(schedules || [slot || "Lun · Matin"]),
        familyId,
      },
    });

    return NextResponse.json(task);
  } catch (error: any) {
    console.error("POST /api/tasks", error);
    return NextResponse.json(
      { error: "Failed to create task: " + (error?.message || "Unknown error") },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const familyId = req.nextUrl.searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json(
        { error: "familyId required" },
        { status: 400 }
      );
    }

    const tasks = await prisma.task.findMany({
      where: { familyId },
      include: { assignments: true },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("GET /api/tasks", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, title, duration, penibility, slot, schedules } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id required" },
        { status: 400 }
      );
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        title: title !== undefined ? title : undefined,
        duration: duration !== undefined ? duration : undefined,
        penibility: penibility !== undefined ? penibility : undefined,
        slot: slot !== undefined ? slot : undefined,
        frequency: schedules ? JSON.stringify(schedules) : undefined,
      },
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error("PUT /api/tasks", error);
    return NextResponse.json(
      { error: "Failed to update task" },
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

    // First delete related assignments
    await prisma.assignment.deleteMany({
      where: { taskId: id },
    });

    // Then delete the task
    await prisma.task.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/tasks", error);
    return NextResponse.json(
      { error: "Failed to delete task: " + (error?.message || "Unknown error") },
      { status: 500 }
    );
  }
}
