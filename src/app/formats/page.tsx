import { redirect } from "next/navigation";

// Merged into /rules (its "Formats" section) so format rules live
// alongside the rest of the game rules on one page. Redirect keeps old
// links/bookmarks working.
export default function FormatsPage() {
  redirect("/rules#formats");
}
