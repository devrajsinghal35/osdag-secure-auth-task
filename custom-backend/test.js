const { spawn } = require('child_process');
const assert = require('assert');

const TEST_PORT = 3001;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Helper to wait
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runIntegrationTests() {
  console.log("🚀 Starting integration test environment...");
  
  // Start server on test port in child process
  const serverProcess = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: TEST_PORT },
    stdio: 'inherit'
  });

  // Give the server 2 seconds to connect to DB and start listening
  await delay(2000);

  let exitCode = 0;

  try {
    console.log("🧪 Running Test 1: Alice Login");
    const loginRes = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.com', password: 'Password123!' })
    });
    
    if (loginRes.status !== 200) {
      console.error(`Login failed. Status: ${loginRes.status}, Body:`, await loginRes.text());
    }
    assert.strictEqual(loginRes.status, 200, "Login should succeed with status 200");
    const loginData = await loginRes.json();
    assert.ok(loginData.token, "Login response should return a valid JWT token");
    const aliceToken = loginData.token;
    console.log("✔ Alice logged in successfully.");

    console.log("🧪 Running Test 2: Get Personal Profile (/me)");
    const meRes = await fetch(`${BASE_URL}/me`, {
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    assert.strictEqual(meRes.status, 200, "Profile fetch should succeed");
    const profileData = await meRes.json();
    assert.strictEqual(profileData.email, 'alice@example.com', "Profile email should match Alice");
    console.log("✔ Profile isolation verified.");

    console.log("🧪 Running Test 3: List Personal Files (/files)");
    const filesRes = await fetch(`${BASE_URL}/files`, {
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    assert.strictEqual(filesRes.status, 200, "Files fetch should succeed");
    const filesData = await filesRes.json();
    
    // Verify Alice only sees her own files
    const containsBobFiles = filesData.files.some(f => f.ownerId === 'usr_002');
    assert.strictEqual(containsBobFiles, false, "Alice's file list should NOT contain Bob's files");
    assert.ok(filesData.files.length > 0, "Alice should have files");
    console.log("✔ File list isolation verified.");

    console.log("🧪 Running Test 4: Access Bob's File (file_003) - Expect 403");
    const forbiddenRes = await fetch(`${BASE_URL}/files/file_003`, {
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    assert.strictEqual(forbiddenRes.status, 403, "Access to another user's file should return 403 Forbidden");
    console.log("✔ File access isolation enforced (403 Forbidden verified).");

    console.log("🧪 Running Test 5: Access Non-Existent File - Expect 404");
    const notFoundRes = await fetch(`${BASE_URL}/files/file_999`, {
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    assert.strictEqual(notFoundRes.status, 404, "Access to non-existent file should return 404 Not Found");
    console.log("✔ Non-existent file returned 404 correctly.");

    console.log("\n🎉 All integration tests passed successfully! Data isolation is fully enforced.");

  } catch (err) {
    console.error("❌ Integration test failed:", err);
    exitCode = 1;
  } finally {
    console.log("Stopping test server...");
    serverProcess.kill();
    process.exit(exitCode);
  }
}

runIntegrationTests();
