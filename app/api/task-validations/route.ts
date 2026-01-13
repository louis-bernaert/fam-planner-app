import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Récupérer toutes les validations d'une famille
export async function GET(req: NextRequest) {
  try {
    const familyId = req.nextUrl.searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json({ error: "familyId required" }, { status: 400 });
    }

    // Récupérer toutes les validations pour les tâches de cette famille
    const validations = await prisma.taskValidation.findMany({
      where: {
        task: {
          familyId,
        },
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
        task: {
          select: { id: true, title: true, duration: true, penibility: true },
        },
      },
    });

    return NextResponse.json(validations);
  } catch (error: any) {
    console.error("GET /api/task-validations", error);
    return NextResponse.json(
      { error: "Failed to fetch validations" },
      { status: 500 }
    );
  }
}

// POST - Valider une tâche effectuée
export async function POST(req: NextRequest) {
  try {
    const { taskId, userId, date, validated } = await req.json();

    if (!taskId || !userId || !date) {
      return NextResponse.json(
        { error: "taskId, userId, and date are required" },
        { status: 400 }
      );
    }

    // Upsert: créer ou mettre à jour la validation
    const validation = await prisma.taskValidation.upsert({
      where: {
        taskId_date: { taskId, date },
      },
      update: {
        userId,
        validated: validated !== undefined ? validated : true,
      },
      create: {
        taskId,
        userId,
        date,
        validated: validated !== undefined ? validated : true,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
        task: {
          select: { id: true, title: true, duration: true, penibility: true },
        },
      },
    });

    return NextResponse.json(validation);
  } catch (error: any) {
    console.error("POST /api/task-validations", error);
    return NextResponse.json(
      { error: "Failed to create validation" },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une validation
export async function DELETE(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    const date = req.nextUrl.searchParams.get("date");

    if (!taskId || !date) {
      return NextResponse.json(
        { error: "taskId and date are required" },
        { status: 400 }
      );
    }

    await prisma.taskValidation.delete({
      where: {
        taskId_date: { taskId, date },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/task-validations", error);
    return NextResponse.json(
      { error: "Failed to delete validation" },
      { status: 500 }
    );
  }
}
