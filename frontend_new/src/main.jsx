// src/main.jsx
/* eslint-disable react-refresh/only-export-components */
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './context/AuthContext'
import AdminDashboard from './views/AdminDashboard' 
import JudgePortal from './views/JudgePortal'
import ParticipantPortal from './views/ParticipantPortal'
import MentorPortal from './views/MentorPortal'
import LandingPage from './views/LandingPage'
import AuthLogin from './views/AuthLogin'
import AuthRegister from './views/AuthRegister'
import AuthResetPassword from './views/AuthResetPassword'


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

function ProtectedAdminRoute({ children }) {
    const { role } = useAuth();
    if (!role) return <Navigate to="/admin/login" replace />;
    if (role !== 'admin') return <Navigate to={`/${role}`} replace />;
    return children;
}

// 1. We define the App component
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/judge" element={<JudgePortal />} />
            <Route path="/participant" element={<ParticipantPortal />} />
            <Route path="/mentor" element={<MentorPortal />} />
            
            <Route path="/admin" element={
                <ProtectedAdminRoute>
                    <AdminDashboard />
                </ProtectedAdminRoute>
            } />
            <Route path="/admin/login" element={<Navigate to="/auth/login" replace />} />
            <Route path="/admin/signup" element={<Navigate to="/auth/register" replace />} />
            
            <Route path="/auth/login" element={<AuthLogin />} />
            <Route path="/auth/register" element={<AuthRegister />} />
            <Route path="/auth/reset-password" element={<AuthResetPassword />} />

            <Route path="/" element={<LandingPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

// 2. THIS WAS THE MISSING PIECE! 
// This tells React to actually take the App and paint it onto the webpage.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)