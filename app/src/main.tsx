import "@/lib/logger";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { TRPCProvider } from './providers/trpc'
import { PreferencesProvider } from './providers/preferences'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <PreferencesProvider>
          <App />
        </PreferencesProvider>
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)
