import { prisma } from "@/lib/prisma";
import { randomBytes, createHash } from "crypto";
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "Email requis" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // Generate random token
    const rawToken = randomBytes(32).toString("hex");
    const hashedToken = createHash("sha256").update(rawToken).digest("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashedToken,
        resetTokenExpiry: expiry,
      },
    });

    // Build reset URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

    // Send email via Nodemailer + Gmail
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: `"Fam'Planner" <${process.env.GMAIL_USER}>`,
      to: user.email,
      subject: `Fam'Planner - Réinitialisation de mot de passe (${Date.now()})`,
      text: [
        `Bonjour ${user.name},`,
        '',
        'Vous avez demandé la réinitialisation de votre mot de passe Fam\'Planner.',
        '',
        'Cliquez sur le lien ci-dessous (valide 1 heure) :',
        resetUrl,
        '',
        'Si vous n\'avez pas fait cette demande, ignorez simplement cet email.',
      ].join('\n'),
      html: [
        `<p>Bonjour ${user.name},</p>`,
        '<p>Vous avez demandé la réinitialisation de votre mot de passe Fam\'Planner.</p>',
        '<p>Cliquez sur le lien ci-dessous (valide 1 heure) :</p>',
        `<p><a href="${resetUrl}">${resetUrl}</a></p>`,
        '<p style="color:gray;font-size:small;">Si vous n\'avez pas fait cette demande, ignorez simplement cet email.</p>',
      ].join(''),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("/api/auth/forgot-password error", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
