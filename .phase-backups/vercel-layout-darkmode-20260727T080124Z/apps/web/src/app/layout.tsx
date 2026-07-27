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
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <head>
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
