# Platform Admin Seed

This patch adds an idempotent local development seed command.

Default seeded account:

- Name: `Mahi Alam`
- Email: `mahialamazad.bd@gmail.com`
- Password: `#1234#Mahialam`

The email intentionally matches the current `PLATFORM_ADMIN_EMAILS` value.

The seed:

- creates the user when absent;
- resets the password when the user already exists;
- verifies the email;
- activates the user;
- revokes existing sessions after a password reset;
- creates or reuses a workspace;
- makes the user the workspace OWNER;
- creates the Free subscription and billing preference when missing;
- creates the workspace storage directories;
- can be run repeatedly.

## Run

```bash
pnpm db:generate
pnpm db:deploy
pnpm seed:admin
```

Optional overrides:

```bash
SEED_ADMIN_NAME="Mahi Alam" \
SEED_ADMIN_EMAIL="mahialamazad.bd@gmail.com" \
SEED_ADMIN_PASSWORD="#1234#Mahialam" \
pnpm seed:admin
```
