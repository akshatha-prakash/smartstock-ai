/**
 * Dirty Dozen Security Specification Cases for SmartStock AI Firestore Rules.
 * Intended for verification against the Firebase Rules Unit Testing emulator.
 */

export const DIRTY_DOZEN_CASES = [
  { id: 1, name: 'Unauthenticated Product Read', path: 'products/prod-1', operation: 'get', auth: null },
  { id: 2, name: 'Cross-Tenant Product Read', path: 'products/prod-alice', operation: 'get', auth: { uid: 'bob-uid', email_verified: true } },
  { id: 3, name: 'Blanket List Scraping Without Owner Filter', path: 'products', operation: 'list', auth: { uid: 'bob-uid', email_verified: true } },
  { id: 4, name: 'Identity Spoofing on Product Create', path: 'products/prod-1', operation: 'create', auth: { uid: 'attacker-uid', email_verified: true }, payload: { ownerId: 'victim-uid' } },
  { id: 5, name: 'Shadow Field Injection on Create', path: 'products/prod-1', operation: 'create', auth: { uid: 'alice-uid', email_verified: true }, payload: { ownerId: 'alice-uid', isAdmin: true } },
  { id: 6, name: 'Shadow Field Injection on Update', path: 'products/prod-1', operation: 'update', auth: { uid: 'alice-uid', email_verified: true }, payload: { ownerId: 'bob-uid' } },
  { id: 7, name: 'Resource Poisoning via Invalid ID', path: 'products/invalid$id@123', operation: 'create', auth: { uid: 'alice-uid', email_verified: true } },
  { id: 8, name: 'Negative Stock Manipulation', path: 'products/prod-1', operation: 'update', auth: { uid: 'alice-uid', email_verified: true }, payload: { quantity: -50 } },
  { id: 9, name: 'Client-Forged CreatedAt Timestamp', path: 'products/prod-1', operation: 'create', auth: { uid: 'alice-uid', email_verified: true }, payload: { createdAt: '2020-01-01T00:00:00Z' } },
  { id: 10, name: 'Cross-User Profile PII Read', path: 'users/alice-uid', operation: 'get', auth: { uid: 'bob-uid', email_verified: true } },
  { id: 11, name: 'Orphaned Transaction Injection', path: 'transactions/tx-1', operation: 'create', auth: { uid: 'alice-uid', email_verified: true }, payload: { productId: 'nonexistent-prod' } },
  { id: 12, name: 'Immutable Ledger Tampering', path: 'transactions/tx-1', operation: 'delete', auth: { uid: 'alice-uid', email_verified: true } },
];
