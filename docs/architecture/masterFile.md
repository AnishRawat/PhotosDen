# PhotosDen – Authoritative Technical Standards Pack

> This document **replaces and supersedes** all prior drafts:
>
> * backend-standards.md
> * database.md
> * frontend-blueprint.md
> * structure.md
>
> It is intentionally **strict, explicit, and enforceable**. Any deviation must be documented via an ADR (Architecture Decision Record).

---

## PART I — BACKEND CODING STANDARDS (MANDATORY)

### 1. Architectural Law

* Clean Architecture + DDD is **non-negotiable**
* Dependency direction: `interfaces → application → domain` (infrastructure implements inward interfaces)
* Any violation is a **design defect**, not a preference issue

### 2. Layer Responsibilities

#### Domain Layer (Pure)

* Entities, Value Objects, Domain Services only
* Zero framework, zero AWS, zero IO
* No Date.now(), UUIDs, or randomness without abstraction
* Constructors validate invariants

**Forbidden**:

* SDK imports
* Env access
* Logging

---

#### Application Layer (Use-Case Orchestration)

* One class = one business action
* One public method: `execute()`
* Dependencies injected via constructor
* Coordinates domain + interfaces only

**Forbidden**:

* AWS SDK usage
* HTTP, Lambda, API Gateway concepts

---

#### Infrastructure Layer (Implementations)

* Implements interfaces defined in Application
* Contains DynamoDB, S3, Cognito, AWS SDK v3
* No business decisions
* Explicit retry and timeout policies

**AWS Rules**:

* One client per service per Lambda execution
* Conditional writes for idempotency
* No silent retries

**Soft Deletion Rule (MANDATORY)**:
* Repository layer MUST automatically exclude items where `DeletedAt != NULL`.
* Filtering occurs at the repository level, not the caller level.
* Provide explicit `*IncludingDeleted()` methods only for admin/audit use cases.

**Optimistic Locking Rule (MANDATORY)**:
* Every update operation MUST perform a conditional check on the `Version` attribute.
* `Version` must be incremented atomically on every write.
* Append-only inserts (Logs, Daily Billing) are exempt.

---

#### Interface Layer (Delivery)

* Lambda handlers only
* Zod validation mandatory
* Maps request → DTO → use case → response
* Zero business logic

---

### 3. Error Model

```text
BaseError
 ├─ ValidationError (400)
 ├─ UnauthorizedError (401)
 ├─ ForbiddenError (403)
 ├─ NotFoundError (404)
 ├─ ConflictError (409)
 └─ InfrastructureError (500)
```

Rules:

* Errors are typed
* Carry errorCode, message, correlationId
* Stack traces logged only outside prod

---

### 4. Logging

* Structured JSON only
* Correlation ID required
* No console.log

---

### 5. TypeScript Rules

* strict = true
* No `any`
* Explicit return types
* Exhaustive enum checks

---

## PART II — DYNAMODB SINGLE-TABLE DESIGN (LOCKED)

### Table

* Name: `PhotosDenStore`
* PK: `PK`
* SK: `SK`

### Mandatory Attributes (ALL ITEMS)

* `EntityType`
* `OwnerId`
* `CreatedAt`
* `UpdatedAt`
* `Version` (optimistic locking)
* `DeletedAt` (soft delete)

---

### Entity Patterns

#### User

* PK: `USER#<UserSub>`
* SK: `METADATA`

#### Asset

* PK: `USER#<UserSub>`
* SK: `ASSET#<AssetId>`

#### Album

* PK: `USER#<UserSub>`
* SK: `ALBUM#<AlbumId>`

#### Billing (Daily) - Append-only Source of Truth
* PK: `USER#<UserSub>`
* SK: `BILL#DAY#YYYY-MM-DD`
* EntityType: `BILLING_DAILY`
* Attributes: `StorageBytesUsed`, `S3PutRequests`, `S3GetRequests`, `DynamoDbRcu`, `DynamoDbWcu`, `EstimatedUsdCost`, `CalculatedAt`
* **Rule**: Immutable. Never updated, only inserted.

#### Billing (Monthly) - Derived Cache
* PK: `USER#<UserSub>`
* SK: `BILL#MONTH#YYYY-MM`
* EntityType: `BILLING_MONTHLY`
* Attributes: `TotalStorageBytes`, `TotalRequests`, `EstimatedUsdCost`, `EstimatedInrCost` (USD × 85.0), `LastAggregatedAt`
* **Rule**: Safe to recompute and overwrite (with `Version` check).

---

### GSIs (STRICT)

#### GSI1 — Reverse Lookup ONLY

* PK: `SK`
* SK: `PK`
* Allowed entities: Asset ↔ Album links only
* ❌ Users and Billing forbidden

---

### LSIs

* LSI1 (Assets only)

  * PK: `PK`
  * SK: `CapturedAt`

Albums and Billing **MUST NOT** use LSIs

---

### Deletion Strategy

* Soft delete via `DeletedAt`
* Physical delete via TTL (future)

---

## PART III — FRONTEND ARCHITECTURE (FLUTTER)

### 1. Architectural Rule

Widgets **never** contain business logic.

### 2. Layers (Per Feature)

```
feature/
 ├─ view/        # Widgets only
 ├─ view_model/  # State + orchestration
 ├─ use_case/    # Business intent
 ├─ repository/  # Data access abstraction
```

---

### 3. State Management

* Riverpod only
* AsyncValue mandatory
* Providers scoped locally

---

### 4. API Layer

* Single ApiClient
* Typed models only
* Central error mapping
* Timeout + retry defined

---

### 5. Background Sync Constraints

* Explicit user consent
* iOS background limits respected
* No infinite background loops

---

## PART IV — PROJECT STRUCTURE (FINAL)

```
photosden/
├── backend/
│   ├── src/
│   ├── tests/
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
├── frontend/
│   └── lib/
│       ├── core/
│       └── features/
├── infra/
│   ├── modules/
│   └── environments/
├── docs/
│   ├── command-ledger.md
│   ├── decisions/   # ADRs
│   └── architecture/
```

---

## PART V — ENFORCEMENT

* Any violation is a bug
* Any exception requires an ADR
* No code before standards

**This document is the single source of truth for PhotosDen.**
