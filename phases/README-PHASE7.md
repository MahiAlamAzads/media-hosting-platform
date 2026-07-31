# Phase 7 — Production auth completion (server + client)

Server:

- Every JWT request checks session, user status, verification, password version, membership and workspace status in PostgreSQL.
- Refresh rotation records replacement sessions and detects reuse.
- Refresh reuse revokes the entire token family and creates a security event.
- Login throttling by email and IP with persisted attempts.
- Verification/reset token invalidation and resend cooldown.
- Account profile, change-email confirmation and guarded account deletion.
- Password reset revokes all sessions.

Client:

- Login and registration
- Verify email
- Resend/forgot/reset flows
- Confirm changed email
- Automatic one-time access-token refresh
- Account profile/change email
- Password change and active session management
- API key create/list/revoke

2FA/TOTP is intentionally not included here and should remain a separate phase.
