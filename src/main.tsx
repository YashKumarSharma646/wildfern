import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'

// Three entry points, each its own bundle: the public site, a guest's booking pass, and the
// owner dashboard — so the pass and the dashboard never download the 3D forest.
const path = window.location.pathname
const Page = path.startsWith('/admin')
  ? lazy(() => import('./admin/AdminApp.tsx'))
  : path.startsWith('/pass/')
    ? lazy(() => import('./pages/PassPage.tsx'))
    : lazy(() => import('./App.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </StrictMode>,
)
