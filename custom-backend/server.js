require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const apiApp = express();
const LISTENING_PORT = process.env.PORT || 3000;
const JWT_ENCRYPTION_KEY = process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production';
const DB_CONNECTION_STRING = process.env.DATABASE_URL || 'postgres://myuser:mypassword@localhost:5432/mydatabase';

const postgresClient = new Client({ connectionString: DB_CONNECTION_STRING });
postgresClient.connect().catch(e => console.error('Failed to connect to database layer:', e));

apiApp.use(express.json());
apiApp.use(cors());

// --- Security Config ---
const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 5, 
  message: { error: 'Maximum authentication attempts exceeded. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// --- JWT Verification Guard ---
const requireValidSession = async (req, res, next) => {
  const authVal = req.headers['authorization'];
  const bearerToken = authVal && authVal.split(' ')[1];
  
  if (!bearerToken) return res.status(401).json({ error: 'Authentication missing or invalid.' });

  try {
    const blacklistCheck = await postgresClient.query('SELECT * FROM token_blacklist WHERE token = $1', [bearerToken]);
    if (blacklistCheck.rows.length > 0) {
      return res.status(401).json({ error: 'Session has been invalidated.' });
    }

    jwt.verify(bearerToken, JWT_ENCRYPTION_KEY, (err, decodedUser) => {
      if (err) return res.status(401).json({ error: 'Authentication token is expired or corrupt.' });
      req.activeUser = decodedUser;
      req.activeToken = bearerToken; 
      next();
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal system fault.' });
  }
};

// --- API Endpoints ---

apiApp.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password fields are mandatory.' });

  try {
    const duplicateCheck = await postgresClient.query('SELECT id FROM users WHERE email = $1', [email]);
    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ error: 'This email is already associated with an account.' });
    }

    const uniqueId = 'u_' + Math.random().toString(36).slice(2, 8);
    const hashedPwd = await bcrypt.hash(password, 10);
    const defaultDisplayName = email.split('@')[0];
    const timestamp = new Date().toISOString();

    await postgresClient.query(`
      INSERT INTO users (id, email, password_hash, display_name, created_at, role)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [uniqueId, email, hashedPwd, defaultDisplayName, timestamp, 'standard_user']);

    res.status(201).json({ id: uniqueId, email });
  } catch (err) {
    console.error("Registration endpoint failed:", err);
    res.status(500).json({ error: 'Internal system fault.' });
  }
});

apiApp.post('/login', authRateLimiter, async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const fetchUser = await postgresClient.query('SELECT * FROM users WHERE email = $1', [email]);
    const matchedRecord = fetchUser.rows[0];

    if (!matchedRecord || !(await bcrypt.compare(password, matchedRecord.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials provided.' });
    }

    const signedJwt = jwt.sign({ id: matchedRecord.id, email: matchedRecord.email }, JWT_ENCRYPTION_KEY, { expiresIn: '1h' });
    res.status(200).json({ token: signedJwt, user: { id: matchedRecord.id, email: matchedRecord.email } });
  } catch (err) {
    console.error("Login endpoint failed:", err);
    res.status(500).json({ error: 'Internal system fault.' });
  }
});

apiApp.post('/logout', requireValidSession, async (req, res) => {
  try {
    await postgresClient.query('INSERT INTO token_blacklist (token) VALUES ($1)', [req.activeToken]);
    res.status(200).json({ message: 'Session securely terminated.' });
  } catch (err) {
    console.error("Logout endpoint failed:", err);
    res.status(500).json({ error: 'Internal system fault.' });
  }
});

apiApp.get('/me', requireValidSession, async (req, res) => {
  try {
    const fetchUser = await postgresClient.query('SELECT id, email, full_name, display_name, bio, created_at, role FROM users WHERE id = $1', [req.activeUser.id]);
    const matchedRecord = fetchUser.rows[0];
    if (!matchedRecord) return res.status(401).json({ error: 'Authentication missing or invalid.' });

    res.status(200).json({
      id: matchedRecord.id,
      email: matchedRecord.email,
      profile: {
        fullName: matchedRecord.full_name,
        displayName: matchedRecord.display_name,
        bio: matchedRecord.bio,
        createdAt: matchedRecord.created_at,
        role: matchedRecord.role
      }
    });
  } catch (err) {
    console.error("Profile endpoint failed:", err);
    res.status(500).json({ error: 'Internal system fault.' });
  }
});

apiApp.get('/files', requireValidSession, async (req, res) => {
  try {
    const fileRecords = await postgresClient.query('SELECT * FROM files WHERE owner_id = $1', [req.activeUser.id]);
    const filePayload = fileRecords.rows.map(record => ({
      id: record.id,
      ownerId: record.owner_id,
      fileName: record.file_name,
      mimeType: record.mime_type,
      sizeBytes: record.size_bytes,
      uploadedAt: record.uploaded_at
    }));
    res.status(200).json({ files: filePayload });
  } catch (err) {
    console.error("Files list endpoint failed:", err);
    res.status(500).json({ error: 'Internal system fault.' });
  }
});

apiApp.get('/files/:id', requireValidSession, async (req, res) => {
  try {
    const targetFileId = req.params.id;
    const fileRecordFetch = await postgresClient.query('SELECT * FROM files WHERE id = $1', [targetFileId]);
    const fileRec = fileRecordFetch.rows[0];

    if (!fileRec) return res.status(404).json({ error: 'Requested file resource not found.' });
    if (fileRec.owner_id !== req.activeUser.id) return res.status(403).json({ error: 'Access restricted for this file.' });

    res.status(200).json({
      file: {
        id: fileRec.id,
        ownerId: fileRec.owner_id,
        fileName: fileRec.file_name,
        mimeType: fileRec.mime_type,
        sizeBytes: fileRec.size_bytes,
        uploadedAt: fileRec.uploaded_at
      }
    });
  } catch (err) {
    console.error("File fetch endpoint failed:", err);
    res.status(500).json({ error: 'Internal system fault.' });
  }
});

apiApp.get('/files/:id/download', requireValidSession, async (req, res) => {
  try {
    const targetFileId = req.params.id;
    const fileRecordFetch = await postgresClient.query('SELECT * FROM files WHERE id = $1', [targetFileId]);
    const fileRec = fileRecordFetch.rows[0];

    if (!fileRec) return res.status(404).send('Requested file resource not found.');
    if (fileRec.owner_id !== req.activeUser.id) return res.status(403).send('Access restricted.');

    const mockBinaryStream = `[MOCK DATA STREAM]\\nFilename: ${fileRec.file_name}\\nType: ${fileRec.mime_type}\\nSize: ${fileRec.size_bytes} bytes.\\n(Normally this would stream binary file data)`;
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(mockBinaryStream);
  } catch (err) {
    console.error("File download endpoint failed:", err);
    res.status(500).send('Internal system fault.');
  }
});

apiApp.listen(LISTENING_PORT, () => {
  console.log(`Backend API operational and listening on port ${LISTENING_PORT}`);
});
