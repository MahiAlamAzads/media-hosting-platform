# Phase 18 — Global WhatsApp Support Button

Adds one fixed WhatsApp support action to the bottom-right corner of every
customer and admin page.

## Behavior

- Customer web app and separate admin console are both covered at root layout
  level, including authentication and error pages rendered inside those apps.
- Desktop shows the WhatsApp icon and `WhatsApp support` label.
- Mobile shows one compact icon to avoid clutter.
- Safe-area insets are respected on modern mobile devices.
- The current page origin and pathname are added to the support message.
  Query strings and hashes are intentionally excluded so reset or verification
  tokens are not shared.
- Links open in a new tab with safe `noopener noreferrer` behavior.
- Keyboard focus and reduced-motion preferences are supported.
- A `whatsapp_contact_clicked` browser event and optional `dataLayer` event are
  emitted for analytics.

## Configuration

```env
NEXT_PUBLIC_WHATSAPP_NUMBER=8801790789691
NEXT_PUBLIC_WHATSAPP_MESSAGE=Hello, I need help with Media Platform.
```

The phone number can also be written as `01790789691`; the component normalizes
Bangladesh local format to the international WhatsApp format automatically.

After changing a `NEXT_PUBLIC_` environment value, rebuild both Next.js apps.

No database migration or API change is required.
