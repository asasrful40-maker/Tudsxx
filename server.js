const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 10;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.disable('x-powered-by');
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR, { index: false, dotfiles: 'deny' }));

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedMimeTypes.has(file.mimetype) && allowedExtensions.has(ext)) {
      return cb(null, true);
    }
    cb(new Error('শুধু JPG, JPEG, PNG, WEBP অথবা GIF ছবি আপলোড করা যাবে।'));
  }
});

app.get('/', (_req, res) => {
  res.json({ success: true, message: 'Image Upload API is running.' });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ success: true, status: 'ok' });
});

// Send one or more images using multipart/form-data; field name must be "images".
app.post('/api/upload', upload.array('images', MAX_FILES), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'কোনো ছবি পাওয়া যায়নি। images নামে ফাইল পাঠান।' });
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const images = req.files.map((file) => ({
    originalName: file.originalname,
    filename: file.filename,
    path: `/uploads/${encodeURIComponent(file.filename)}`,
    url: `${baseUrl}/uploads/${encodeURIComponent(file.filename)}`,
    size: file.size,
    mimetype: file.mimetype
  }));

  return res.status(201).json({
    success: true,
    message: 'ছবি সফলভাবে আপলোড হয়েছে।',
    totalImages: images.length,
    images
  });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: err.message, code: err.code });
  }
  return res.status(400).json({ success: false, message: err.message || 'আপলোডে সমস্যা হয়েছে।' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Image Upload API listening on port ${PORT}`);
});
