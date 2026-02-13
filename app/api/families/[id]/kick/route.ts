import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: familyId } = await params;
    const body = await req.json();
    const { userId, requesterId } = body;

    if (!userId || !requesterId) {
      return NextResponse.json(
        { error: "userId and requesterId required" },
        { status: 400 }
      );
    }

    // Verify the requester is an admin in this family
    const requesterMembership = await prisma.membership.findFirst({
      where: { userId: requesterId, familyId },
    });

    if (!requesterMembership || requesterMembership.role !== "admin") {
      return NextResponse.json(
        { error: "Seul un admin peut exclure un membre" },
        { status: 403 }
      );
    }

    // Verify the target user is a simple member (not admin/owner)
    const targetMembership = await prisma.membership.findFirst({
      where: { userId, familyId },
    });

    if (!targetMembership) {
      return NextResponse.json(
        { error: "Ce membre ne fait pas partie de cette famille" },
        { status: 404 }
      );
    }

    if (targetMembership.role !== "member") {
      return NextResponse.json(
        { error: "Impossible d'exclure un admin" },
        { status: 403 }
      );
    }

    // Get all task IDs for this family to clean up related data
    const familyTasks = await prisma.task.findMany({
      where: { familyId },
      select: { id: true },
    });
    const taskIds = familyTasks.map((t) => t.id);

    // Delete related data for this user in this family
    if (taskIds.length > 0) {
      await prisma.assignment.deleteMany({
        where: { userId, taskId: { in: taskIds } },
      });
      await prisma.taskRegistration.deleteMany({
        where: { userId, taskId: { in: taskIds } },
      });
      await prisma.taskValidation.deleteMany({
        where: { userId, taskId: { in: taskIds } },
      });
      await prisma.taskEvaluation.deleteMany({
        where: { userId, taskId: { in: taskIds } },
      });
    }

    // Delete the membership
    await prisma.membership.delete({
      where: { id: targetMembership.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/families/[id]/kick", error);
    return NextResponse.json(
      { error: "Erreur lors de l'exclusion du membre" },
      { status: 500 }
    );
  }
}
