import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body ?? {};

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { memberships: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Google-only accounts cannot login with password
    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "This account uses Google. Please log in with Google." },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
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
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
