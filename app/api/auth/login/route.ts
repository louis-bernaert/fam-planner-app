import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body ?? {};

    if (!email || !password) {
      return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { memberships: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Mot de passe invalide" }, { status: 401 });
    }

    const cleanUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      familyIds: user.memberships.map((m) => m.familyId),
      points: user.points,
    };
    return NextResponse.json({ user: cleanUser });
  } catch (error) {
    console.error("/api/auth/login error", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
