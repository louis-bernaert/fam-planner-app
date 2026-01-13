import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type ResetPeriod = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "all_time";

function getDateRange(period: ResetPeriod): { startDate: string; endDate: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  let startDate: Date;
  let endDate: Date;

  switch (period) {
    case "today":
      startDate = today;
      endDate = today;
      break;
    
    case "yesterday":
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 1);
      endDate = startDate;
      break;
    
    case "this_week":
      // Lundi de cette semaine
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() + mondayOffset);
      endDate = today;
      break;
    
    case "last_week":
      // Lundi de la semaine dernière au dimanche
      const currentDayOfWeek = today.getDay();
      const lastMondayOffset = currentDayOfWeek === 0 ? -13 : -6 - currentDayOfWeek;
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() + lastMondayOffset);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      break;
    
    case "this_month":
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = today;
      break;
    
    case "last_month":
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0); // Dernier jour du mois précédent
      break;
    
    case "all_time":
      startDate = new Date(2000, 0, 1); // Date très ancienne
      endDate = new Date(2100, 11, 31); // Date très future
      break;
    
    default:
      startDate = today;
      endDate = today;
  }

  // Format YYYY-MM-DD
  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  
  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  };
}

// POST - Réinitialiser les points (supprimer les validations)
export async function POST(req: NextRequest) {
  try {
    const { userId, familyId, period } = await req.json();

    if (!userId || !familyId || !period) {
      return NextResponse.json(
        { error: "userId, familyId, and period are required" },
        { status: 400 }
      );
    }

    const { startDate, endDate } = getDateRange(period as ResetPeriod);

    // Récupérer les tâches de la famille
    const familyTasks = await prisma.task.findMany({
      where: { familyId },
      select: { id: true },
    });

    const taskIds = familyTasks.map(t => t.id);

    // Supprimer les validations pour cet utilisateur, ces tâches et cette période
    const result = await prisma.taskValidation.deleteMany({
      where: {
        userId,
        taskId: { in: taskIds },
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      period,
      startDate,
      endDate,
    });
  } catch (error: any) {
    console.error("POST /api/settings/points/reset", error);
    return NextResponse.json(
      { error: "Failed to reset points" },
      { status: 500 }
    );
  }
}
