import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Orders & Settlements",
  description: "CrossVal take-home assessment",
};

// Runs before React hydrates, so a returning visitor who chose dark mode
// never sees a flash of the light theme first. Kept intentionally tiny and
// dependency-free — this is the one place in the app where a plain inline
// script is the right tool instead of a React effect.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = window.localStorage.getItem('orders-and-settlements:theme');
    if (stored === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning is required here, specifically for this
    // element: THEME_INIT_SCRIPT deliberately adds the "dark" class to
    // <html> before React hydrates (that's the whole point — no flash of
    // the wrong theme), so the server-rendered className will legitimately
    // never match the client's on a dark-mode visit. Without this prop,
    // React treats that expected, intentional difference as a hydration
    // error — which triggers Next's dev error overlay, an invisible
    // full-viewport layer that swallows clicks meant for the page
    // underneath (explains "the due date calendar doesn't come up" and the
    // error surfacing specifically on the next click). suppressHydrationWarning
    // only applies to this element's own attributes, not its children, so
    // it doesn't hide real hydration bugs anywhere else in the app.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-zinc-50 font-sans dark:bg-zinc-950">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
