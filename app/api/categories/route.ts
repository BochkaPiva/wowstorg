import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const categories = await prisma.category.findMany({
    orderBy: [{ name: "asc" }],
    include: {
      _count: {
        select: {
          items: true,
        },
      },
    },
  });

  return NextResponse.json({
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      itemCount: category._count.items,
    })),
  });
}
