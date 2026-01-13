import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Récupérer toutes les inscriptions d'une famille
export async function GET(req: NextRequest) {
  try {
    const familyId = req.nextUrl.searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json({ error: "familyId required" }, { status: 400 });
    }

    // Récupérer toutes les inscriptions pour les tâches de cette famille
    const registrations = await prisma.taskRegistration.findMany({
      where: {
        task: {
          familyId,
        },
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(registrations);
  } catch (error: any) {
    console.error("GET /api/task-registrations", error);
    return NextResponse.json(
      { error: "Failed to fetch registrations" },
      { status: 500 }
    );
  }
}

// POST - S'inscrire à une tâche pour une date
export async function POST(req: NextRequest) {
  try {
    const { taskId, userId, date } = await req.json();

    if (!taskId || !userId || !date) {
      return NextResponse.json(
        { error: "taskId, userId, and date are required" },
        { status: 400 }
      );
    }

    // Upsert: créer ou mettre à jour l'inscription
    const registration = await prisma.taskRegistration.upsert({
      where: {
        taskId_date: { taskId, date },
      },
      update: {
        userId,
      },
      create: {
        taskId,
        userId,
        date,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(registration);
  } catch (error: any) {
    console.error("POST /api/task-registrations", error);
    return NextResponse.json(
      { error: "Failed to create registration" },
      { status: 500 }
    );
  }
}

// DELETE - Se désinscrire d'une tâche
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

    await prisma.taskRegistration.delete({
      where: {
        taskId_date: { taskId, date },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/task-registrations", error);
    return NextResponse.json(
      { error: "Failed to delete registration" },
      { status: 500 }
    );
  }
}
