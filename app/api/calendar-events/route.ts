import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Récupérer tous les événements locaux d'une famille
export async function GET(req: NextRequest) {
  try {
    const familyId = req.nextUrl.searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json({ error: "familyId required" }, { status: 400 });
    }

    const events = await prisma.calendarEvent.findMany({
      where: { familyId },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error("GET /api/calendar-events", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar events" },
      { status: 500 }
    );
  }
}

// POST - Créer un événement local
export async function POST(req: NextRequest) {
  try {
    const {
      title,
      date,
      startTime,
      endTime,
      allDay,
      description,
      location,
      recurrence,
      recurrenceEnd,
      userId,
      familyId,
    } = await req.json();

    if (!title || !date || !userId || !familyId) {
      return NextResponse.json(
        { error: "title, date, userId, familyId required" },
        { status: 400 }
      );
    }

    const membership = await prisma.membership.findFirst({
      where: { userId, familyId },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "User not in family" },
        { status: 403 }
      );
    }

    const event = await prisma.calendarEvent.create({
      data: {
        title,
        date,
        startTime: allDay ? null : startTime || null,
        endTime: allDay ? null : endTime || null,
        allDay: allDay || false,
        description: description || null,
        location: location || null,
        recurrence: recurrence || "none",
        recurrenceEnd: recurrenceEnd || null,
        userId,
        familyId,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(event);
  } catch (error) {
    console.error("POST /api/calendar-events", error);
    return NextResponse.json(
      { error: "Failed to create calendar event" },
      { status: 500 }
    );
  }
}

// PUT - Modifier un événement local
export async function PUT(req: NextRequest) {
  try {
    const {
      id,
      title,
      date,
      startTime,
      endTime,
      allDay,
      description,
      location,
      recurrence,
      recurrenceEnd,
      userId,
    } = await req.json();

    if (!id || !userId) {
      return NextResponse.json(
        { error: "id and userId required" },
        { status: 400 }
      );
    }

    const existing = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const updated = await prisma.calendarEvent.update({
      where: { id },
      data: {
        title,
        date,
        startTime: allDay ? null : startTime,
        endTime: allDay ? null : endTime,
        allDay,
        description: description || null,
        location: location || null,
        recurrence: recurrence || "none",
        recurrenceEnd: recurrenceEnd || null,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/calendar-events", error);
    return NextResponse.json(
      { error: "Failed to update calendar event" },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un événement local
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const userId = req.nextUrl.searchParams.get("userId");

    if (!id || !userId) {
      return NextResponse.json(
        { error: "id and userId required" },
        { status: 400 }
      );
    }

    const existing = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    await prisma.calendarEvent.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/calendar-events", error);
    return NextResponse.json(
      { error: "Failed to delete calendar event" },
      { status: 500 }
    );
  }
}
