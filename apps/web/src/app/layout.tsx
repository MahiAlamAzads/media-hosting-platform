import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

const themeBootScript = `
(() => {
  try {
    const stored = localStorage.getItem("media-platform-theme");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = stored === "dark" || stored === "light"
      ? stored
      : systemDark ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();
`;

export const metadata: Metadata = {
  title: {
    default: "Media Platform",
    template: "%s · Media Platform"
  },
  description: "Secure media storage, transformation and delivery."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <link
          rel="stylesheet"
          href="https://vercel.com/geist/vercel-brand.css"
          precedence="vbg"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
