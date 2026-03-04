import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { token, email, password } = await request.json();
    if (!token || !email || !password) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const hashedToken = createHash("sha256").update(token).digest("hex");

    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        resetToken: hashedToken,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired link" },
        { status: 400 }
      );
    }

    const hash = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("/api/auth/reset-password error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
