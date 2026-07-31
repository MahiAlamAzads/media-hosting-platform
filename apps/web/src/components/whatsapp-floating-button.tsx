"use client";

import { useEffect, useMemo, useState } from "react";

const DEFAULT_WHATSAPP_NUMBER = "8801790789691";
const DEFAULT_WHATSAPP_MESSAGE = "Hello, I need help with Media Platform.";

function normalizeWhatsAppNumber(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("00")) {
    return digits.slice(2);
  }

  if (digits.startsWith("0")) {
    return `88${digits}`;
  }

  return digits;
}

function createWhatsAppUrl(
  number: string,
  message: string,
  currentUrl?: string,
): string {
  const pageContext = currentUrl ? `\n\nPage: ${currentUrl}` : "";

  return `https://wa.me/${number}?text=${encodeURIComponent(`${message}${pageContext}`)}`;
}

function getSafeCurrentPageUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export function WhatsAppFloatingButton() {
  const configuredNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim();
  const number = useMemo(
    () => normalizeWhatsAppNumber(configuredNumber || DEFAULT_WHATSAPP_NUMBER),
    [configuredNumber],
  );
  const configuredMessage = process.env.NEXT_PUBLIC_WHATSAPP_MESSAGE?.trim();
  const message = configuredMessage || DEFAULT_WHATSAPP_MESSAGE;
  const [href, setHref] = useState(createWhatsAppUrl(number, message));

  useEffect(() => {
    setHref(createWhatsAppUrl(number, message, getSafeCurrentPageUrl()));
  }, [message, number]);

  function handleClick() {
    const detail = {
      app: "customer",
      location: "global_floating_button",
      pageUrl: getSafeCurrentPageUrl(),
    };

    window.dispatchEvent(
      new CustomEvent("whatsapp_contact_clicked", { detail }),
    );

    const analyticsWindow = window as Window & {
      dataLayer?: Array<Record<string, unknown>>;
    };

    analyticsWindow.dataLayer?.push({
      event: "whatsapp_contact_clicked",
      ...detail,
    });
  }

  return (
    <a
      className="whatsapp-floating-button"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contact support on WhatsApp"
      title="Contact support on WhatsApp"
      onClick={handleClick}
    >
      <span className="whatsapp-floating-icon" aria-hidden="true">
        <i className="bi bi-whatsapp" />
      </span>
      <span className="whatsapp-floating-label">WhatsApp support</span>
    </a>
  );
}
