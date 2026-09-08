"use client";

import { useState } from "react";
import Link from "next/link";

type NavLink = { href: string; label: string };

// Desktop keeps the inline link row exactly as before (sm breakpoint up).
// Below that, the links collapse behind a hamburger toggle instead of
// wrapping messily across multiple lines.
export function NavLinks({
  links,
  isAdmin,
}: {
  links: NavLink[];
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  const allLinks: NavLink[] = [
    ...links,
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle navigation menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded border border-sky-300 text-lg text-slate-600 hover:bg-sky-50 sm:hidden"
      >
        {open ? "✕" : "☰"}
      </button>

      <nav className="hidden items-center gap-5 text-sm text-slate-600 sm:flex">
        {allLinks.map((link) => (
          <Link key={link.href} href={link.href} className="hover:text-blue-600">
            {link.label}
          </Link>
        ))}
      </nav>

      {open && (
        <nav className="absolute inset-x-0 top-full z-40 flex flex-col gap-1 border-b border-sky-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-md sm:hidden">
          {allLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded px-2 py-2 hover:bg-sky-50 hover:text-blue-600"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
