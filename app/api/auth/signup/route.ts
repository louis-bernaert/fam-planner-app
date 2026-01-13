import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name, familyName } = body ?? {};

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "Un compte existe déjà avec cet email" }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 10);
    const family = await prisma.family.create({
      data: {
        name: familyName || "Famille",
      },
    });

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash: hash,
        memberships: {
          create: {
            familyId: family.id,
            role: "owner",
          },
        },
      },
      include: { memberships: true },
    });

    const cleanUser = {
      id: user.id,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      familyIds: user.memberships.map((m) => m.familyId),
      points: user.points,
    };

    return NextResponse.json({ user: cleanUser, family });
  } catch (error) {
    console.error("/api/auth/signup error", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
