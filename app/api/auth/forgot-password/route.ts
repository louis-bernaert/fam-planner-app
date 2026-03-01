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
      subject: "Fam'Planner - Réinitialisation de mot de passe",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #18181b; margin-bottom: 16px;">Réinitialisation de mot de passe</h2>
          <p style="color: #52525b; line-height: 1.6;">Bonjour ${user.name},</p>
          <p style="color: #52525b; line-height: 1.6;">Vous avez demandé la réinitialisation de votre mot de passe Fam'Planner.</p>
          <p style="color: #52525b; line-height: 1.6;">Cliquez sur le bouton ci-dessous (valide 1 heure) :</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 16px 0;">
            <tr>
              <td align="center" style="background: #18181b; border-radius: 10px;">
                <a href="${resetUrl}" target="_blank" style="display: block; padding: 14px 28px; color: #ffffff; text-decoration: none; font-weight: 500; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                  Réinitialiser mon mot de passe
                </a>
              </td>
            </tr>
          </table>
          <p style="color: #a1a1aa; font-size: 13px; margin-top: 24px;">Si vous n'avez pas fait cette demande, ignorez simplement cet email.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("/api/auth/forgot-password error", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
