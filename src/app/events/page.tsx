import { redirect } from "next/navigation";

// The Events list was merged into /play (Play above, Events below) to
// declutter the nav — this keeps old links/bookmarks working.
export default function EventsPage() {
  redirect("/play");
}
