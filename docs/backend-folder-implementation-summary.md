# Backend Folder Implementation - Summary Outline

## 1. Architecture Overview
- **Tech stack and framework:** The backend is built with `Node.js`, `Express`, `Sequelize`, and MySQL. The codebase is mixed `TypeScript` (`index.ts`, `routes/ai.ts`) and `JavaScript` (most controllers, services, and models).
- **Architecture style:** A modular Layered/MVC-lite structure: `routes -> middleware -> controllers -> services/models`.
- **Core design principle:** Responsibilities are separated by domain folders. Middleware handles cross-cutting concerns (authentication, session control, rate limiting), while controllers orchestrate API-level workflows.

## 2. Folder Structure

```text
backend/
  src/
    index.ts
    authorization/
    routes/
    middleware/
    controllers/
    services/
    models/
    security/
    common/
  test/
```

- `authorization/`: Authentication endpoints and controller logic.
- `routes/`: API endpoint mapping by domain.
- `middleware/`: Auth token checks, session guards, RBAC, and rate limiting.
- `controllers/`: Request/response handling and orchestration.
- `services/`: Reusable business logic (registration, caching, notifications).
- `models/`: Sequelize entities and associations.
- `security/` and `common/`: JWT/role matrix and shared DB/config helpers.

## 3. Layer Responsibilities
- **Controllers:** Validate API input, call services/models/queries, and standardize HTTP responses.
- **Services:** Contain reusable business logic shared across endpoints.
- **Models:** Define schemas/relationships and data access via Sequelize.
- **Repositories (optional):** A dedicated repository layer is not currently separated; many data operations are executed directly in controllers/services.
- **Routes:** Map endpoints and attach route-specific middleware.
- **Middleware:** Handle authentication, authorization, session timeout/concurrency control, rate limiting, and domain guards.
- **Config and Utils:** Centralize runtime configuration (`.env`, DB, JWT, CORS) and shared helpers.

## 4. Request Flow
Client -> Route -> Middleware -> Controller -> Service/Model -> Database -> Response

Note: Not every endpoint passes through a service layer; some controllers call Sequelize models or raw SQL directly.

## 5. Key Design Decisions
- **Why this structure:** Domain-based separation enables fast module expansion, and centralized middleware improves reuse of security and policy logic.
- **Benefits:**
  - **Scalability:** New routes/controllers can be added by independent modules.
  - **Maintainability:** Changes are easier to isolate by functional area.
  - **Testability:** Middleware and services can be tested independently (baseline RBAC tests exist).
- **Trade-off:** Some controllers become logic-heavy because the repository/service abstraction is not deeply separated.

## 6. Example Feature Flow
Example: `POST /api/auth/signup`
1. The auth route maps the endpoint and applies registration rate limiting.
2. The `register` controller starts a database transaction.
3. The `createPatientAccountRecords` service validates data, hashes the password, and creates `User`, `Account (PAT)`, and `Patient`.
4. The controller commits the transaction, generates access/refresh tokens, and creates a `Session` record.
5. The API returns `201` with user details, tokens, and expiry information.

## 7. Additional Considerations
- **Security:** JWT with DB-backed session control, global and route-level rate limiting, RBAC capability matrix, and manual validation at controller/service level.
- **Testing:** `backend/test/rbac.test.js` exists; end-to-end coverage is still limited.
- **Deployment:** Runtime is environment-driven (`.env`), supports Cloud SQL socket connectivity, starts listening only after `sequelize.authenticate()` succeeds, and runs in-process reminder schedulers.

## Key References
- `backend/src/index.ts`
- `backend/src/authorization/routes.js`
- `backend/src/authorization/controller.js`
- `backend/src/services/patientRegistrationService.js`
- `backend/src/middleware/authMiddleware.js`
- `backend/src/middleware/sessionMiddleware.js`
- `backend/src/middleware/rateLimitMiddleware.js`
- `backend/src/middleware/authorizeCapability.js`
- `backend/src/security/rbacMatrix.js`
- `backend/src/common/database.js`
- `backend/test/rbac.test.js`
