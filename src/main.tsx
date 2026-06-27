import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sileo'
import 'sileo/styles.css'
import './index.css'
import App from './App.tsx'
import { LocaleProvider } from './i18n/LocaleProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LocaleProvider>
        <Toaster position="top-center" offset={{ top: 18 }} theme="light" options={{ fill: '#020617', roundness: 18, styles: { title: 'font-semibold text-white', description: 'text-slate-300' } }} />
        <App />
      </LocaleProvider>
    </BrowserRouter>
  </StrictMode>,
)
