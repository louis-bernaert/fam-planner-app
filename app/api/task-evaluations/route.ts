import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: Récupérer les évaluations pour une famille
export async function GET(req: NextRequest) {
  try {
    const familyId = req.nextUrl.searchParams.get("familyId");
    const taskId = req.nextUrl.searchParams.get("taskId");
    const userId = req.nextUrl.searchParams.get("userId");

    if (!familyId) {
      return NextResponse.json(
        { error: "familyId required" },
        { status: 400 }
      );
    }

    // Get all tasks for this family first
    const familyTasks = await prisma.task.findMany({
      where: { familyId },
      select: { id: true }
    });
    const taskIds = familyTasks.map(t => t.id);

    const whereClause: any = {
      taskId: { in: taskIds }
    };

    if (taskId) {
      whereClause.taskId = taskId;
    }
    if (userId) {
      whereClause.userId = userId;
    }

    const evaluations = await prisma.taskEvaluation.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } }
      }
    });

    return NextResponse.json(evaluations);
  } catch (error) {
    console.error("GET /api/task-evaluations", error);
    return NextResponse.json(
      { error: "Failed to fetch evaluations" },
      { status: 500 }
    );
  }
}

// POST: Créer ou mettre à jour une évaluation
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId, userId, duration, penibility } = body;

    if (!taskId || !userId) {
      return NextResponse.json(
        { error: "taskId and userId required" },
        { status: 400 }
      );
    }

    // Upsert - créer ou mettre à jour
    const evaluation = await prisma.taskEvaluation.upsert({
      where: {
        taskId_userId: { taskId, userId }
      },
      update: {
        duration: duration ?? 30,
        penibility: penibility ?? 30
      },
      create: {
        taskId,
        userId,
        duration: duration ?? 30,
        penibility: penibility ?? 30
      }
    });

    return NextResponse.json(evaluation);
  } catch (error: any) {
    console.error("POST /api/task-evaluations", error);
    return NextResponse.json(
      { error: "Failed to save evaluation: " + (error?.message || "Unknown error") },
      { status: 500 }
    );
  }
}

// DELETE: Supprimer une évaluation
export async function DELETE(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    const userId = req.nextUrl.searchParams.get("userId");

    if (!taskId || !userId) {
      return NextResponse.json(
        { error: "taskId and userId required" },
        { status: 400 }
      );
    }

    await prisma.taskEvaluation.delete({
      where: {
        taskId_userId: { taskId, userId }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/task-evaluations", error);
    return NextResponse.json(
      { error: "Failed to delete evaluation" },
      { status: 500 }
    );
  }
}
