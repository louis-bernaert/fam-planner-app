import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error || !code) {
    return NextResponse.redirect(
      `${baseUrl}/planner?auth=login&error=google_denied`
    );
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${baseUrl}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      return NextResponse.redirect(
        `${baseUrl}/planner?auth=login&error=google_token`
      );
    }

    // Get user profile from Google
    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );
    const profile = await profileRes.json();

    if (!profile.email) {
      return NextResponse.redirect(
        `${baseUrl}/planner?auth=login&error=google_email`
      );
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: profile.email.toLowerCase() },
      include: { memberships: true },
    });

    if (user) {
      // Link Google ID if not already linked
      if (!user.googleId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { googleId: profile.id },
        });
      }
    } else {
      // Create new user (no password for Google-only accounts)
      user = await prisma.user.create({
        data: {
          email: profile.email.toLowerCase(),
          name: profile.name || profile.email.split("@")[0],
          passwordHash: "",
          googleId: profile.id,
        },
        include: { memberships: true },
      });
    }

    const cleanUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      familyIds: user.memberships.map((m: { familyId: string }) => m.familyId),
      points: user.points,
    };

    const userData = encodeURIComponent(JSON.stringify(cleanUser));
    return NextResponse.redirect(`${baseUrl}/planner?googleAuth=${userData}`);
  } catch (err) {
    console.error("Google OAuth error:", err);
    return NextResponse.redirect(
      `${baseUrl}/planner?auth=login&error=google_server`
    );
  }
}
