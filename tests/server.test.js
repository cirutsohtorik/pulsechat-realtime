const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { Database } = require('../dist/db/database');
const { AuthService } = require('../dist/auth/authService');

console.log('🧪 Running PulseChat Automated Test Suite...\n');

// 1. Test Auth Service
function testAuth() {
  console.log('🔹 Testing AuthService...');
  
  // Password hashing and verification
  const rawPass = 'SecretPassword123!';
  const hash = AuthService.hashPassword(rawPass);
  assert(hash.includes(':'), 'Hash must contain salt delimiter');
  assert(AuthService.verifyPassword(rawPass, hash), 'Valid password must verify');
  assert(!AuthService.verifyPassword('WrongPass', hash), 'Invalid password must fail verification');
  console.log('  ✔ Password PBKDF2 hashing and verification passed');

  // Token generation and verification
  const token = AuthService.generateToken('user_test_1', 'alice');
  assert(typeof token === 'string', 'Token must be a string');
  assert.strictEqual(token.split('.').length, 3, 'JWT must have 3 segments');

  const payload = AuthService.verifyToken(token);
  assert(payload !== null, 'Valid token must decode');
  assert.strictEqual(payload.username, 'alice', 'Decoded username must match');
  assert.strictEqual(payload.userId, 'user_test_1', 'Decoded userId must match');

  // Tampered token test
  const tampered = token.slice(0, -4) + 'abcd';
  const badPayload = AuthService.verifyToken(tampered);
  assert.strictEqual(badPayload, null, 'Tampered token must be rejected');
  console.log('  ✔ Cryptographic JWT generation and tampering detection passed');
}

// 2. Test Database Layer
function testDatabase() {
  console.log('🔹 Testing Database Layer...');
  const testDir = path.join(process.cwd(), 'data_test');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  const testDb = new Database(testDir);

  // Check default rooms
  const rooms = testDb.getRooms();
  assert(rooms.length >= 4, 'Must seed default rooms');
  assert(rooms.some(r => r.id === 'general'), 'General room must exist');
  console.log('  ✔ Default room seeding passed');

  // User creation
  const user = testDb.createUser('testuser', 'some_hash_val');
  assert.strictEqual(user.username, 'testuser');
  assert(user.id.startsWith('usr_'));

  const retrieved = testDb.getUserByUsername('testuser');
  assert.strictEqual(retrieved.id, user.id);
  console.log('  ✔ User creation and persistence passed');

  // Duplicate user check
  let dupThrew = false;
  try {
    testDb.createUser('testuser', 'another_hash');
  } catch {
    dupThrew = true;
  }
  assert(dupThrew, 'Creating duplicate user must throw');
  console.log('  ✔ Duplicate user prevention passed');

  // Message creation & retrieval
  const msg1 = testDb.createMessage('general', user.id, user.username, 'Hello world');
  assert.strictEqual(msg1.content, 'Hello world');
  const msg2 = testDb.createMessage('general', user.id, user.username, 'Second message');

  const history = testDb.getRecentMessages('general', 10);
  assert.strictEqual(history.length, 2);
  assert.strictEqual(history[0].id, msg1.id);
  assert.strictEqual(history[1].id, msg2.id);
  console.log('  ✔ Message persistence and history ordering passed');

  // Cleanup test dir
  fs.rmSync(testDir, { recursive: true, force: true });
}

// Execute tests
try {
  testAuth();
  testDatabase();
  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! (6/6 assertions verified)');
  process.exit(0);
} catch (err) {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
}
