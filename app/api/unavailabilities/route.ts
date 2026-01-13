import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, slot } = body;

    if (!userId || !slot) {
      return NextResponse.json(
        { error: "userId and slot required" },
        { status: 400 }
      );
    }

    const unavailability = await prisma.unavailability.create({
      data: {
        userId,
        slot,
      },
    });

    return NextResponse.json(unavailability);
  } catch (error) {
    console.error("POST /api/unavailabilities", error);
    return NextResponse.json(
      { error: "Failed to create unavailability" },
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

    const unavailabilities = await prisma.unavailability.findMany({
      where: { userId },
    });

    return NextResponse.json(unavailabilities);
  } catch (error) {
    console.error("GET /api/unavailabilities", error);
    return NextResponse.json(
      { error: "Failed to fetch unavailabilities" },
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

    await prisma.unavailability.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/unavailabilities", error);
    return NextResponse.json(
      { error: "Failed to delete unavailability" },
      { status: 500 }
    );
  }
}
