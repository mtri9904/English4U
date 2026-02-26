# MebiFarm CMS – Frontend
---

## Tech Stack

- **React 18 + TypeScript**
- **Vite**
- **Ant Design v5**
- **Tailwind CSS v4**
- **React Router v6 (Browser Router)**
- **TanStack Query** – server state
- **Zustand** – client / UI state
- **Axios** – HTTP client

---

## setup & run project & architecture

```bash
npm install
npm run dev

src/
├── app/                         # App shell (bootstrap)
│   ├── providers/               # Global providers
│   │   ├── QueryProvider.tsx    # TanStack Query
│   │   └── AntdProvider.tsx     # Ant Design theme
│   │
│   ├── router/                  # Routing system
│   │   ├── index.tsx            # useRoutes
│   │   ├── routes.tsx           # route config
│   │   └── PrivateRoute.tsx     # auth guard
│   │
│   └── App.tsx                  # Root App (render router only)
│
├── layouts/                     # Layouts
│   ├── AdminLayout/             # Sidebar + Header (dashboard)
│   └── AuthLayout/              # Login layout
│
├── features/                    # Domain-based modules
│   ├── auth/
│   │   ├── pages/
│   │   │   └── LoginPage.tsx
│   │   ├── api/
│   │   │   └── auth.api.ts
│   │   └── store/
│   │       └── auth.store.ts
│   │
│   ├── dashboard/
│   │   └── pages/
│   │       └── DashboardPage.tsx
│   │
│   └── users/                   # Example feature
│       ├── pages/
│       ├── components/
│       ├── api/
│       └── hooks/
│
├── services/                    # Infrastructure layer
│   ├── axios.instance.ts        # Axios config
│   ├── handleApi.ts             # callApi wrapper
│   └── types.ts
│
├── stores/                      # Global Zustand store
│   └── ui.store.ts              # UI state (sidebar, theme…)
│
├── constants/                   # Constants & configs
│   ├── env.ts                   # Environment variables
│   ├── routes.ts
│   └── api-routes.ts
│
├── styles/
│   └── globals.css              # Global CSS (optional)
│
├── utils/                       # Helpers
│   └── format.ts
│
├── index.css                    # Tailwind entry
├── main.tsx                     # App bootstrap

