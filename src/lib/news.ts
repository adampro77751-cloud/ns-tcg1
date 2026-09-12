// Homepage "Latest News" content. Add future news items here — each one
// renders as a NewsCard (see src/components/news-card.tsx). Keep `badge`
// short (fits on one line in the card header). The first item with
// `featured: true` is shown as the large hero story; only one should be
// featured at a time.
export type NewsItem = {
  id: string;
  title: string;
  category: string;
  badge: string;
  text: string;
  featured?: boolean;
};

export const NEWS_ITEMS: NewsItem[] = [
  {
    id: "release-tuesday",
    title: "NS TCG Releases Tuesday!",
    category: "NS TCG",
    badge: "RELEASE NEWS",
    text:
      "NS TCG officially releases this Tuesday. Players will soon be able to start playing, building decks, and discovering NS TCG for themselves — get ready.",
    featured: true,
  },
];
