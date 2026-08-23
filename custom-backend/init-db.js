require('dotenv').config();
const { Client } = require('pg');
const filesystem = require('fs');
const pathModule = require('path');
const passwordHasher = require('bcryptjs');

const DB_CONNECTION_STRING = process.env.DATABASE_URL || 'postgres://myuser:mypassword@localhost:5432/mydatabase';

async function bootstrapDatabase() {
  const pgNode = new Client({ connectionString: DB_CONNECTION_STRING });
  try {
    await pgNode.connect();
    console.log('>>> Established connection to Postgres DB.');

    await pgNode.query(`DROP TABLE IF EXISTS files;`);
    await pgNode.query(`DROP TABLE IF EXISTS token_blacklist;`);
    await pgNode.query(`DROP TABLE IF EXISTS users;`);

    await pgNode.query(`
      CREATE TABLE users (
        id VARCHAR(50) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        display_name VARCHAR(255),
        bio TEXT,
        created_at TIMESTAMP,
        role VARCHAR(50)
      );
    `);

    await pgNode.query(`
      CREATE TABLE files (
        id VARCHAR(50) PRIMARY KEY,
        owner_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100),
        size_bytes INTEGER,
        uploaded_at TIMESTAMP
      );
    `);

    await pgNode.query(`
      CREATE TABLE token_blacklist (
        token TEXT PRIMARY KEY,
        blacklisted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('>>> Schema tables successfully provisioned.');

    const seedLocation = pathModule.join(__dirname, '..', 'frontend', 'seed-data.json');
    const rawJson = filesystem.readFileSync(seedLocation, 'utf-8');
    const parsedData = JSON.parse(rawJson);

    for (const record of parsedData.users) {
      const secureHash = await passwordHasher.hash(record.password, 10);
      
      await pgNode.query(`
        INSERT INTO users (id, email, password_hash, full_name, display_name, bio, created_at, role)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        record.id, record.email, secureHash, record.profile.fullName, record.profile.displayName, 
        record.profile.bio, record.profile.createdAt, record.profile.role
      ]);

      for (const fileItem of record.files) {
        await pgNode.query(`
          INSERT INTO files (id, owner_id, file_name, mime_type, size_bytes, uploaded_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          fileItem.id, fileItem.ownerId, fileItem.fileName, fileItem.mimeType, fileItem.sizeBytes, fileItem.uploadedAt
        ]);
      }
    }

    console.log('>>> Mock accounts and files successfully seeded into database.');
  } catch (error) {
    console.error('>>> Critical failure during database initialization:', error);
  } finally {
    await pgNode.end();
  }
}

bootstrapDatabase();
