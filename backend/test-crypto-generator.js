/**
 * Test Crypto Values Generator
 * 
 * Generates valid encrypted DEK values for testing backend endpoints.
 * Run: node test-crypto-generator.js
 */

const crypto = require('crypto');

// Generate random salt (32 bytes)
function generateSalt() {
  return crypto.randomBytes(32).toString('base64');
}

// Generate random IV (12 bytes for GCM)
function generateIV() {
  return crypto.randomBytes(12).toString('base64');
}

// Derive Master Key using PBKDF2
async function deriveMasterKey(password, saltBase64) {
  const salt = Buffer.from(saltBase64, 'base64');
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 32, 'sha256', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

// Generate and encrypt DEK
async function generateEncryptedDEK(password, saltBase64) {
  // Generate random DEK (32 bytes)
  const dek = crypto.randomBytes(32);
  
  // Get Master Key
  const masterKey = await deriveMasterKey(password, saltBase64);
  
  // Generate IV for DEK encryption
  const iv = crypto.randomBytes(12);
  
  // Encrypt DEK with Master Key using AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Combine IV + ciphertext + auth tag
  const combined = Buffer.concat([iv, encrypted, authTag]);
  
  return combined.toString('base64');
}

// Generate test values
async function generateTestValues(password = 'TestPassword123!') {
  console.log('\n🔐 Generating Zero-Knowledge Test Values...\n');
  
  const salt = generateSalt();
  const encryptedDEK = await generateEncryptedDEK(password, salt);
  
  const values = {
    // For signup
    password,
    kdfSalt: salt,
    kdfIterations: 100000,
    encryptedDEK,
    
    // For upload testing
    photoIV: generateIV(),
    thumbnailIV: generateIV(),
  };
  
  console.log('=== SIGNUP REQUEST BODY ===');
  console.log(JSON.stringify({
    identifier: 'test@example.com',
    password: values.password,
    encryptedDEK: values.encryptedDEK,
    kdfSalt: values.kdfSalt,
    kdfIterations: values.kdfIterations,
  }, null, 2));
  
  console.log('\n=== UPLOAD REQUEST (photo metadata) ===');
  console.log(JSON.stringify({
    originalFilename: 'test-photo.jpg',
    mimeType: 'image/jpeg',
    encryptedSize: 1048576,
    iv: values.photoIV,
    capturedAt: new Date().toISOString(),
    hasThumbnail: true,
    thumbnailIV: values.thumbnailIV,
  }, null, 2));
  
  console.log('\n=== PASSWORD CHANGE (generate new values) ===');
  const newSalt = generateSalt();
  const newPassword = 'NewPassword456!';
  const newEncryptedDEK = await generateEncryptedDEK(newPassword, newSalt);
  
  console.log(JSON.stringify({
    oldPassword: values.password,
    newPassword: newPassword,
    newEncryptedDEK: newEncryptedDEK,
    newKdfSalt: newSalt,
    newKdfIterations: 100000,
  }, null, 2));
  
  console.log('\n✅ Copy these values to Postman!\n');
}

// Run it
generateTestValues().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
