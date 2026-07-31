# Phase 4 — Developer API keys and account security

Adds:

- Workspace API key creation
- Scoped API keys
- API key authentication through `Authorization: Bearer`
- Key listing and revocation
- Last-used timestamp and IP
- Optional key expiry
- Active session listing
- Selected session revocation
- Logout all sessions
- Change password
- Resend verification for signed-in unverified users
- API key unit tests

## API key format

```text
mh_live_<key-id>.<secret>
```

The raw key is returned only once. Only an HMAC hash is stored in PostgreSQL.

## Routes

```text
GET    /api/v1/api-keys
POST   /api/v1/api-keys
DELETE /api/v1/api-keys/:apiKeyId

GET    /api/v1/security/sessions
DELETE /api/v1/security/sessions/:sessionId
POST   /api/v1/security/logout-all
POST   /api/v1/security/change-password
POST   /api/v1/security/resend-verification
```

API-key scope enforcement is applied to upload, folder and media routes. User JWT sessions retain full workspace permissions.
