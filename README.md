# Image Upload API

A small Node.js API using Express and Multer. It accepts image files as `multipart/form-data`, saves them to an `uploads/` directory (or `UPLOAD_DIR`), and returns public URLs.

## Requirements

- Node.js 18 or newer
- npm

## Run locally

```bash
npm install
npm start
```

The API runs at `http://localhost:3000` by default. Set `PORT` to change the port.

## Endpoints

- `GET /` — API status
- `GET /health` — health check
- `POST /api/upload` — upload one or more images

### Upload request

Send `multipart/form-data` to `/api/upload`. The file field name must be `images`. You can attach up to 10 files; each file can be up to 5 MB. Accepted image formats: JPG/JPEG, PNG, WEBP, GIF.

Example using curl:

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "images=@./photo.jpg" \
  -F "images=@./another-photo.png"
```

Example response:

```json
{
  "success": true,
  "message": "ছবি সফলভাবে আপলোড হয়েছে।",
  "totalImages": 1,
  "images": [
    {
      "originalName": "photo.jpg",
      "filename": "...jpg",
      "path": "/uploads/...jpg",
      "url": "http://localhost:3000/uploads/...jpg",
      "size": 12345,
      "mimetype": "image/jpeg"
    }
  ]
}
```

## Deploy

1. Push this folder to a GitHub repository.
2. Create a new Node web service on your hosting provider and connect the repository.
3. Use `npm install` as the build command and `npm start` as the start command. The included `render.yaml` provides a Render Blueprint starting point.
4. The host should provide `PORT` automatically; the app listens on `0.0.0.0`.

### Important: persistent file storage

Many cloud hosts use temporary filesystems. Files saved in `uploads/` may disappear after a redeploy or restart. For durable uploads, attach a persistent disk and set `UPLOAD_DIR` to its mount path, or use object storage such as Amazon S3, Cloudinary, or Supabase Storage. The returned URL is served by this app, so the app and its upload storage must remain available publicly.

## Notes

- Uploaded files are excluded from Git using `.gitignore`.
- The MIME type and filename extension are checked, but this is not a complete content-level file validation system. For production, consider inspecting file signatures, adding authentication/rate limiting, and using malware scanning where appropriate.
- If the app is behind a trusted reverse proxy, configure Express `trust proxy` appropriately before relying on forwarded protocol headers to generate HTTPS URLs.
