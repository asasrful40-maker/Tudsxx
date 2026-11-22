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
const express = require('express');
const multer = require('multer');
const admin = require('firebase-admin');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://your-project-id-default-rtdb.firebaseio.com'
  });
}

const db = admin.database();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'));
    }
  }
});

async function analyzeFreeFireScreenshot(imageBuffer, mimetype) {
  // Add OCR/Vision API logic here to verify Free Fire UI and extract kills/win status
  return {
    isValid: true,
    isWinner: false,
    kills: 0
  };
}

app.post('/api/verify-result', upload.single('screenshot'), async (req, res) => {
  try {
    const { userId, matchId, roomId, password } = req.body;
    const file = req.file;

    if (!userId || !matchId || !roomId || !password || !file) {
      return res.status(400).json({ success: false, message: 'Missing required fields or file.' });
    }

    const matchSnapshot = await db.ref(`matches/${matchId}`).once('value');
    const matchData = matchSnapshot.val();

    if (!matchData) {
      return res.status(404).json({ success: false, message: 'Match not found.' });
    }

    const participants = matchData.participants || {};
    const hasJoined = Object.values(participants).some(
      (p) => p === userId || (typeof p === 'object' && p.userId === userId)
    );

    if (!hasJoined) {
      return res.status(403).json({ success: false, message: 'Access denied. You have not joined this match.' });
    }

    const claimRef = db.ref(`match_claims/${matchId}/${userId}`);
    const existingClaim = await claimRef.once('value');
    if (existingClaim.exists()) {
      return res.status(409).json({ success: false, message: 'Result already claimed.' });
    }

    const dbRoomId = String(matchData.roomId || '').trim();
    const dbPassword = String(matchData.roomPassword || matchData.password || '').trim();

    if (String(roomId).trim() !== dbRoomId || String(password).trim() !== dbPassword) {
      return res.status(401).json({ success: false, message: 'Invalid Room ID or Password.' });
    }

    const analysis = await analyzeFreeFireScreenshot(file.buffer, file.mimetype);
    if (!analysis.isValid) {
      return res.status(422).json({ success: false, message: 'Invalid Free Fire screenshot.' });
    }

    const winningPrize = Number(matchData.winPrize || matchData.winningPrize || 0);
    const perKillRate = Number(matchData.perKill || matchData.perKillRate || 0);

    let rewardAmount = 0;
    if (analysis.isWinner) rewardAmount += winningPrize;
    if (analysis.kills > 0) rewardAmount += analysis.kills * perKillRate;

    if (rewardAmount <= 0) {
      await claimRef.set({
        verified: true,
        kills: 0,
        isWinner: false,
        rewardCredited: 0,
        timestamp: admin.database.ServerValue.TIMESTAMP
      });
      return res.status(200).json({
        success: true,
        credited: false,
        message: 'Assalamu Alaikum. Details verified, but no kills or win detected.'
      });
    }

    const userWalletRef = db.ref(`users/${userId}/winningBalance`);
    const transactionResult = await userWalletRef.transaction((currentBalance) => {
      return (Number(currentBalance) || 0) + rewardAmount;
    });

    if (!transactionResult.committed) {
      throw new Error('Failed to update balance.');
    }

    await claimRef.set({
      verified: true,
      kills: analysis.kills,
      isWinner: analysis.isWinner,
      rewardCredited: rewardAmount,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });

    return res.status(200).json({
      success: true,
      credited: true,
      rewardAmount,
      newBalance: transactionResult.snapshot.val(),
      message: `Verified! ${rewardAmount} TK added to balance.`
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
