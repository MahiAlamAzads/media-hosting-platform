# Media Platform developer examples

These examples upload media through the real resumable API and support both
public and private delivery.

## 1. Environment

```env
MEDIA_PLATFORM_API_URL=http://localhost:4000
MEDIA_PLATFORM_API_KEY=mh_live_your_key_id.your_secret
```

Production example:

```env
MEDIA_PLATFORM_API_URL=https://api.alamahi.cloud
MEDIA_PLATFORM_API_KEY=mh_live_your_key_id.your_secret
```

Keep the API key on a trusted server. Never expose it in browser code,
`NEXT_PUBLIC_` variables, mobile bundles or public repositories.

## 2. Recommended key scopes

For uploading and private signed delivery:

```text
uploads:write
media:read
```

Add this only when your integration changes visibility, filename or folder:

```text
media:write
```

## 3. Choose visibility

### Public

Use for product photos, avatars, public posts and website images.

```text
PUBLIC
```

The completion response contains a permanent `imgUrl`:

```html
<img src="https://cdn.alamahi.cloud/i/ASSET_ID" alt="Product" />
```

### Private

Use for invoices, internal files and protected user media.

```text
PRIVATE
```

The completion response contains `imgUrl: null`. Create a temporary signed
delivery URL when an authorized user needs the file.

## 4. Next.js / TypeScript

Copy:

```text
media-platform-client.ts
```

to:

```text
src/lib/media-platform-client.ts
```

Then add `nextjs-upload-route.ts` as your server Route Handler.

## 5. Node.js

Public upload:

```bash
node node-upload.mjs ./photo.jpg image/jpeg PUBLIC
```

Private upload:

```bash
node node-upload.mjs ./invoice.jpg image/jpeg PRIVATE
```

## 6. Express

```bash
npm install express multer
```

Mount `express-media-route.mjs`, then send multipart form data:

```text
file=<binary file>
visibility=PUBLIC
```

or:

```text
visibility=PRIVATE
```

## 7. Fastify

```bash
npm install fastify @fastify/multipart
```

Register `fastify-media-route.mjs` as a plugin, send the file as multipart,
and choose visibility in the query string:

```text
POST /media?visibility=PUBLIC
POST /media?visibility=PRIVATE
```

## 8. PHP

Requires PHP 8.1+ and cURL.

Public:

```bash
php php-upload.php ./photo.jpg image/jpeg PUBLIC
```

Private:

```bash
php php-upload.php ./invoice.jpg image/jpeg PRIVATE
```

## 9. Store these fields

Always store:

```text
assetId
```

For public images, also use or store:

```text
imgUrl
```

Do not permanently store private signed URLs because they expire.
