"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlayerAction } from "@/lib/player-access";
import { prisma } from "@/lib/prisma";
import { enterDraft, pickCardInDraft, startDraftMatches, advanceDraftAfterMatch } from "@/lib/draft";

export type DraftFormState = { error: string | null };

function errorState(error: unknown): DraftFormState {
  return { error: error instanceof Error ? error.message : "Couldn't update your draft. Try again." };
}

function versionFrom(form: FormData): number {
  const raw = form.get("version");
  const version = raw === null ? NaN : Number(raw);
  if (!Number.isInteger(version) || version < 0) throw new Error("Refresh your draft and try again.");
  return version;
}

export async function enterDraftAction(_previous: DraftFormState, form: FormData): Promise<DraftFormState> {
  const session = await requirePlayerAction();
  let id: string;
  try {
    const mode = String(form.get("mode") ?? "casual");
    if (mode !== "ranked" && mode !== "casual") throw new Error("Choose casual or ranked draft.");
    id = await enterDraft(session.user.id, String(form.get("setName") ?? ""), mode === "ranked");
  } catch (error) { return errorState(error); }
  revalidatePath("/", "layout");
  redirect(`/play/digital/draft/${id}`);
}

export async function pickDraftAction(_previous: DraftFormState, form: FormData): Promise<DraftFormState> {
  const session = await requirePlayerAction();
  const podId = String(form.get("podId") ?? "");
  try {
    const index = form.get("index");
    if (index === null) throw new Error("Choose a card from this pack.");
    await pickCardInDraft(session.user.id, podId, versionFrom(form), Number(index));
  } catch (error) { return errorState(error); }
  revalidatePath(`/play/digital/draft/${podId}`);
  revalidatePath("/collection");
  return { error: null };
}

export async function startDraftAction(_previous: DraftFormState, form: FormData): Promise<DraftFormState> {
  const session = await requirePlayerAction();
  const podId = String(form.get("podId") ?? "");
  let matchId: string;
  try {
    const deck: unknown = JSON.parse(String(form.get("deck") ?? "null"));
    if (!Array.isArray(deck) || deck.length > 30 || !deck.every((id) => typeof id === "string")) {
      throw new Error("Choose 20–30 cards from your draft pool.");
    }
    matchId = await startDraftMatches(session.user.id, podId, versionFrom(form), deck);
  } catch (error) { return errorState(error); }
  revalidatePath(`/play/digital/draft/${podId}`);
  redirect(`/play/digital/${matchId}`);
}

export async function resumeDraftAction(_previous: DraftFormState, form: FormData): Promise<DraftFormState> {
  const session = await requirePlayerAction();
  const podId = String(form.get("podId") ?? "");
  try {
    const pod = await prisma.draftPod.findFirst({ where: { id: podId, userId: session.user.id }, select: { id: true } });
    if (!pod) throw new Error("Draft not found.");
    const last = await prisma.digitalMatch.findFirst({
      where: { draftPodId: podId }, orderBy: { draftRound: "desc" }, select: { id: true, status: true },
    });
    if (last?.status === "COMPLETED") await advanceDraftAfterMatch(last.id);
  } catch (error) { return errorState(error); }
  revalidatePath(`/play/digital/draft/${podId}`);
  revalidatePath("/store/packs");
  return { error: null };
}
