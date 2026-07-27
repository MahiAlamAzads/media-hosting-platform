import "./globals.css";
export const metadata = { title: "Media Platform", description: "Self-hosted media SaaS" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
