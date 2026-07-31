import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import type { Metadata } from "next";
import { WhatsAppFloatingButton } from "@/components/whatsapp-floating-button";

export const metadata: Metadata = {
  title: {
    default: "Media Platform",
    template: "%s · Media Platform",
  },
  description: "Secure media hosting, delivery and developer API management.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <WhatsAppFloatingButton />
      </body>
    </html>
  );
}
