# Logistics Pro - Platform Architecture (Sync V2)

This project follows a **Multi-tenant SaaS Architecture** designed to scale from a single operation into a global logistics platform.

## 🏗️ Project Hierarchy & Branches

To maintain order across different brands and clients, we use the following nomenclature:

### 1. CORE (The Engine)

- **Environment:** `localhost`
- **Purpose:** Technical foundation and "Laboratory". All new features (GPS, AI Routing, Dashboard improvements) are developed and tested here first.
- **Branch:** `core`

### 2. SHOWCASE (The Demo)

- **Environment:** `https://frufresco.vercel.app` (Temporary URL)
- **Branding:** **Logistics Pro** (White-label)
- **Purpose:** Sales and demonstrations. It is always mirrors the `CORE` features but remains brand-neutral to showcase to potential third-party clients.
- **Branch:** `main` (or `showcase`)

### 3. TENANT_FRUFRESCO (Official Production)

- **Environment:** Pending Deployment
- **Branding:** **FruFresco** (Original)
- **Purpose:** The production-ready instance for the official operation.
- **Branch:** `tenant-frufresco`

### 4. TENANT\_[CLIENT_NAME] (Future Instances)

- **Purpose:** Custom instances for third-party companies. Modules can be enabled or disabled based on client needs/subscription plans.

---

## 🛠️ Development Workflow

1. **Develop** new features in the `CORE`.
2. **Merge** to `SHOWCASE` for client demos.
3. **Deploy** to specific `TENANTS` for production use.
4. **Feature Flagging:** Use settings to enable/disable specific modules per tenant.

## Getting Started

First, run the development server:

```bash
npm run dev -p 3001
```

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result.
