import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const familyId = req.nextUrl.searchParams.get("familyId");

    if (familyId) {
      // Get users for a specific family via memberships
      const memberships = await prisma.membership.findMany({
        where: { familyId },
        include: { user: true },
      });
      
      const users = memberships.map((m) => ({
        ...m.user,
        familyId: m.familyId,
        isAdmin: m.role === "admin",
      }));
      
      return NextResponse.json(users);
    }

    // Get all users
    const users = await prisma.user.findMany({
      include: {
        memberships: {
          include: { family: true },
        },
      },
    });

    // Transform to include familyId for compatibility
    const transformedUsers = users.map((u) => ({
      ...u,
      familyId: u.memberships[0]?.familyId || null,
      isAdmin: u.memberships[0]?.role === "admin",
    }));

    return NextResponse.json(transformedUsers);
  } catch (error) {
    console.error("GET /api/users", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, password, familyId } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email required" },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 }
      );
    }

    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash: password || "",
        ...(familyId && {
          memberships: {
            create: {
              familyId,
              role: "member",
            },
          },
        }),
      },
      include: {
        memberships: true,
      },
    });

    return NextResponse.json({
      ...user,
      familyId: user.memberships[0]?.familyId || null,
    });
  } catch (error) {
    console.error("POST /api/users", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
