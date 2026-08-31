import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CreateEventForm } from "./create-event-form";

export default async function CreateEventPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const formats = await prisma.format.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight">Create event</h1>
      <CreateEventForm formats={formats} />
    </div>
  );
}
