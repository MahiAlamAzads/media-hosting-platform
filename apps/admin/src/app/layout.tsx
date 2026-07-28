import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import type { Metadata } from "next";
import { WhatsAppFloatingButton } from "@/components/whatsapp-floating-button";

export const metadata: Metadata = {
  title: {
    default: "Admin Console",
    template: "%s · Media Platform Admin"
  },
  description: "Platform administration, billing operations and system health."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <WhatsAppFloatingButton />
      </body>
    </html>
  );
}
