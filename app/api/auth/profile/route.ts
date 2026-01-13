import { prisma } from "@/lib/prisma";

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, name, email, password } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "User ID required" }), {
        status: 400,
      });
    }

    // Build update data
    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (password) updateData.passwordHash = password; // Note: should be hashed in production

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return new Response(JSON.stringify(updatedUser), { status: 200 });
  } catch (error) {
    console.error("Profile update error:", error);
    return new Response(JSON.stringify({ error: "Failed to update profile" }), {
      status: 500,
    });
  }
}
