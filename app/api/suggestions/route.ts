import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { userId, familyId, content } = await req.json();

    if (!userId || !familyId || !content?.trim()) {
      return NextResponse.json(
        { error: "userId, familyId et content requis" },
        { status: 400 }
      );
    }

    const suggestion = await prisma.suggestion.create({
      data: { userId, familyId, content: content.trim() },
      include: { user: { select: { name: true, email: true } } },
    });

    // Send to Google Apps Script webhook (awaited so Vercel doesn't kill the function)
    const webhookUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: suggestion.id,
            content: suggestion.content,
            userName: suggestion.user.name,
            userEmail: suggestion.user.email,
            createdAt: suggestion.createdAt.toISOString(),
          }),
        });
      } catch {
        console.error("Failed to send suggestion to Google Apps Script");
      }
    }

    return NextResponse.json(suggestion);
  } catch (error) {
    console.error("POST /api/suggestions", error);
    return NextResponse.json(
      { error: "Failed to create suggestion" },
      { status: 500 }
    );
  }
}
