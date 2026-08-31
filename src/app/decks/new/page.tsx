import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NewDeckForm } from "./new-deck-form";

export default async function NewDeckPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const formats = await prisma.format.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight">New deck</h1>
      <NewDeckForm formats={formats} />
    </div>
  );
}
