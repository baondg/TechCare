# Frontend Folder Implementation - Summary Outline

## 1. Architecture Overview
- **Tech stack and framework:** The frontend is built with `React` + `TypeScript` on `Vite` (Rolldown Vite), with `React Router` for navigation and Tailwind/Radix-based UI components.
- **Architecture style:** A modular, feature-oriented component architecture with practical layering: `pages/components -> hooks/services -> api client`.
- **Core design principle:** UI concerns are separated from API access. Reusable service modules and hooks centralize data-fetching and workflow logic, while pages compose domain-specific screens.

## 2. Folder Structure

```text
frontend/
  src/
    main.tsx
    App.tsx
    api/
    authentication/
    components/
    contexts/
    hooks/
    lib/
    pages/
    services/
    test/
    types/
```

- `main.tsx`: Application bootstrap (`BrowserRouter`, `AuthProvider`, root render).
- `App.tsx`: Central route table and lazy-loaded page registration.
- `authentication/`: Login and registration screens.
- `pages/`: Role-based screens (patient, doctor, nurse, technician, admin).
- `components/`: Shared UI and layout components.
- `contexts/`: Cross-cutting state (notably authentication/session context).
- `services/`: Domain API wrappers (appointments, notifications, AI, profiles, work shifts).
- `api/`: Central HTTP client abstraction.
- `hooks/`, `lib/`, `types/`: Reusable hooks, utility helpers, and shared typings.

## 3. Layer Responsibilities
- **Pages:** Assemble role-specific views and invoke hooks/services for feature workflows.
- **Components:** Provide reusable UI building blocks and layout shells.
- **Services:** Encapsulate business-oriented API operations and response shaping.
- **API client:** Standardizes HTTP requests, attaches Bearer tokens, and handles unauthorized responses globally.
- **Context:** Manages app-wide session/auth state and exposes typed auth operations.
- **Hooks and utils:** Reuse local state logic and helper transformations across features.

## 4. Request Flow
User Action -> Page/Component -> Hook/Service -> `api/client` -> Backend API -> Service Mapping -> UI State Update -> Render

Note: Some features call the central API client through services, while authentication also performs direct `fetch` calls in `AuthContext` for login/signup flows.

## 5. Key Design Decisions
- **Why this structure:** The codebase supports multiple clinical roles (patient/doctor/nurse/technician/admin), so role-based page modules and shared services reduce duplication.
- **Benefits:**
  - **Scalability:** New role pages and service methods can be added without changing core bootstrap logic.
  - **Maintainability:** API concerns are centralized in `services` and `api/client`, reducing repeated request code.
  - **Performance:** Extensive route-level lazy loading lowers initial bundle pressure for large dashboards.
- **Trade-off:** Route definitions in `App.tsx` are extensive and may become harder to manage as the number of screens grows.

## 6. Example Feature Flow
Example: User login (`/login`)
1. The login page collects credentials and calls `useAuth().login(...)`.
2. `AuthContext` posts credentials to `/api/auth/login`.
3. On success, token/user/session expiry are stored in `localStorage`.
4. Auth state is updated in context, enabling authenticated navigation.
5. Subsequent service calls use `api/client`, which automatically injects `Authorization: Bearer <token>`.

## 7. Additional Considerations
- **Security:** Token-based auth is persisted in `localStorage`; unauthorized API responses (`401/403`) trigger auth cleanup and redirect to `/login`.
- **Testing:** Vitest + Testing Library are configured (`src/test/setup.ts`), with scripts for run and coverage in `package.json`.
- **Deployment:** Production build uses a multi-stage Dockerfile (`node` builder + `nginx` runner) with environment-driven API base URL (`VITE_API_BASE_URL`).

## Key References
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/contexts/auth-context.tsx`
- `frontend/src/api/client.ts`
- `frontend/src/components/protected-route.tsx`
- `frontend/src/services/appointment-service.ts`
- `frontend/src/test/setup.ts`
- `frontend/package.json`
- `frontend/Dockerfile.prod`
