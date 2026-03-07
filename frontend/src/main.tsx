import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from "react-router-dom"
import './index.css'
import App from './App.tsx'
<<<<<<< HEAD
import { AuthProvider } from './contexts/AuthContext'
=======
import NetworkBackground from "@/components/NetworkBackground";
>>>>>>> 0d84f273 (Add doctor portal)


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
