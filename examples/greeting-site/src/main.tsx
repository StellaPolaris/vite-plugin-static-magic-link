import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import './styles.css'

const Home = lazy(() => import('./routes/Home'))
const Gallery = lazy(() => import('./routes/Gallery'))

// build.test.ts looks for this string in the decrypted bundle.
document.documentElement.dataset.fixture = 'SML_FIXTURE_MARKER'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/gallery" element={<Gallery />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
