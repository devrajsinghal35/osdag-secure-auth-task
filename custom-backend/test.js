const assert = require('assert');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Test password hashing
async function testHashing() {
  const password = "Password123!";
  const hash = await bcrypt.hash(password, 10);
  const isValid = await bcrypt.compare(password, hash);
  assert.strictEqual(isValid, true, "Bcrypt hashing verification failed");
  console.log("✔ Bcrypt hashing test passed.");
}

// Test JWT creation and validation
function testJWT() {
  const payload = { id: "usr_001", email: "alice@example.com" };
  const secret = "test-secret";
  const token = jwt.sign(payload, secret, { expiresIn: '1h' });
  const decoded = jwt.verify(token, secret);
  assert.strictEqual(decoded.id, payload.id, "JWT decoded ID mismatch");
  assert.strictEqual(decoded.email, payload.email, "JWT decoded email mismatch");
  console.log("✔ JWT creation & verification test passed.");
}

async function runTests() {
  console.log("Running backend logic tests...");
  try {
    await testHashing();
    testJWT();
    console.log("All unit tests passed successfully!");
  } catch (err) {
    console.error("Test suite failed:", err);
    process.exit(1);
  }
}

runTests();
