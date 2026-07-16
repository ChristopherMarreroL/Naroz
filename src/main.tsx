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
        <Toaster
          position="top-center"
          offset={{ top: 18 }}
          theme="light"
          options={{
            fill: '#172b4d',
            roundness: 16,
            styles: {
              title: 'naroz-toast-title',
              description: 'naroz-toast-description',
            },
          }}
        />
        <App />
      </LocaleProvider>
    </BrowserRouter>
  </StrictMode>,
)
