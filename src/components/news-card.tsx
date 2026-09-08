import type { NewsItem } from "@/lib/news";

// Reusable card for the homepage "Latest News" section (see
// src/lib/news.ts for the data). `featured` renders as the large hero
// story; every other item renders compact.
export function NewsCard({ item, featured = false }: { item: NewsItem; featured?: boolean }) {
  if (featured) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-600 via-blue-600 to-sky-500 p-8 text-white shadow-xl sm:p-10">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wide backdrop-blur-sm">
          {item.badge}
        </span>
        <h3 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
          {item.title}
        </h3>
        <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-sky-100">
          {item.category}
        </p>
        <p className="mt-4 max-w-2xl text-base text-sky-50">{item.text}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      <span className="inline-block rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-violet-700">
        {item.badge}
      </span>
      <h3 className="mt-3 text-lg font-bold tracking-tight text-slate-900">{item.title}</h3>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {item.category}
      </p>
      <p className="mt-3 text-sm text-slate-600">{item.text}</p>
    </div>
  );
}
