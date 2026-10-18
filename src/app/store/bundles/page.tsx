import { redirect } from "next/navigation";

export default async function BundlesPage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const params = await searchParams;
  redirect(params.cancelled === "1" ? "/store?cancelled=1" : "/store");
}
