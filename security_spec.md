# SmartStock AI Security Specification

## 1. Data Invariants
1. **Strict Ownership**: Every `UserProfile`, `Product`, and `StockTransaction` belongs strictly to a single verified `request.auth.uid` (`ownerId == request.auth.uid`). No cross-user reads or writes are permitted.
2. **Verified Identity**: All writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Immutable Ownership & Timestamps**: `ownerId` and `createdAt` cannot be modified after creation. `createdAt` and `updatedAt` must equal `request.time`.
4. **Ledger Atomicity**: A `StockTransaction` can only be created when the referenced `Product` exists (or is created/updated in the same atomic batch via `existsAfter` / `getAfter`), belongs to the same `ownerId`, and its resulting `quantity` matches `resultingStock`.
5. **Non-Negative Stock & Pricing**: `purchasePrice`, `sellingPrice`, `quantity`, `minStock`, `previousStock`, and `resultingStock` must be `>= 0`; transaction `quantity` must be `> 0`.
6. **Strict Schema Enforcement**: No shadow/ghost fields are allowed (`keys().hasOnly(...)` on create and `affectedKeys().hasOnly(...)` on update), and every string is bounded in length.
7. **Append-Only Ledger**: `StockTransaction` records cannot be updated or deleted from client SDKs, preserving an immutable audit trail.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Product Read**: `get /products/prod-1` with `auth: null`.
2. **Cross-Tenant Product Read**: `get /products/prod-alice` as `bob` (`uid != ownerId`).
3. **Blanket List Query Scraping**: `list /products` without `where('ownerId', '==', uid)`.
4. **Identity Spoofing on Create**: `create /products/prod-1` with `ownerId: "victim-uid"` as `attacker-uid`.
5. **Shadow Field Injection on Create**: `create /products/prod-1` with extra `isAdmin: true` ghost field.
6. **Shadow Field Injection on Update**: `update /products/prod-1` modifying `ownerId` or injecting `verified: true`.
7. **Resource Poisoning via Oversized ID**: `create /products/<200-char-invalid-id>` or special chars `$@#`.
8. **Negative Stock Manipulation**: `update /products/prod-1` setting `quantity: -50`.
9. **Client-Forged Timestamp**: `create /products/prod-1` with `createdAt` in the past instead of `request.time`.
10. **PII Leak on Users Collection**: `get /users/alice-uid` as `bob-uid`.
11. **Orphaned Transaction Injection**: `create /transactions/tx-1` referencing non-existent `productId: "missing"`.
12. **Ledger Tampering / Deletion**: `update /transactions/tx-1` or `delete /transactions/tx-1` by any user.
