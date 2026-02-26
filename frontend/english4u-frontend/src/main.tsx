import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app/styles/globals.css'
import { AppProviders } from './app/providers/AppProviders'
import { App } from './App'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
)
