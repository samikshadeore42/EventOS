// src/main.jsx
/* eslint-disable react-refresh/only-export-components */
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AdminDashboard from './views/AdminDashboard' 
import JudgePortal from './views/JudgePortal'
import ParticipantPortal from './views/ParticipantPortal'
import MentorPortal from './views/MentorPortal'
import LandingPage from './views/LandingPage'
import AuthLogin from './views/AuthLogin'
import AuthRegister from './views/AuthRegister'
import AuthVerifyEmail from './views/AuthVerifyEmail'
import AuthForgotPassword from './views/AuthForgotPassword'
import AuthResetPasswordConfirm from './views/AuthResetPasswordConfirm'
import AuthAcceptInvitation from './views/AuthAcceptInvitation'
import ConfigureEvent from './views/ConfigureEvent'
import { queryClient } from './queryClient'
import { QueryClientProvider } from '@tanstack/react-query'

function ProtectedAdminRoute({ children }) {
    const { authenticated, isPortalUser, activeOrganization, activeMembership, orgsLoaded } = useAuth();

    if (!authenticated) return <Navigate to="/auth/login" replace />;
    if (isPortalUser) return <Navigate to="/" replace />;

    if (!orgsLoaded) {
        return <div className="flex items-center justify-center h-screen text-slate-400">Loading...</div>;
    }

    if (!activeOrganization || !activeMembership) {
        return <Navigate to="/" replace />;
    }

    return children;
}

// 1. We define the App component
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/events/:eventId/portal/judge" element={<JudgePortal />} />
            <Route path="/events/:eventId/portal/participant" element={<ParticipantPortal />} />
            <Route path="/events/:eventId/portal/mentor" element={<MentorPortal />} />
            <Route path="/events/:eventId/mentor" element={<MentorPortal />} />
            <Route path="/event/:eventId/portal/mentor" element={<MentorPortal />} />
            
            <Route path="/admin" element={
                <ProtectedAdminRoute>
                    <AdminDashboard />
                </ProtectedAdminRoute>
            } />
            <Route path="/admin/login" element={<Navigate to="/auth/login" replace />} />
            <Route path="/admin/signup" element={<Navigate to="/auth/register" replace />} />
            
            <Route path="/configure" element={
            <ProtectedAdminRoute>
                <ConfigureEvent />
            </ProtectedAdminRoute>
            } />

            <Route path="/auth/login" element={<AuthLogin />} />
            <Route path="/auth/register" element={<AuthRegister />} />
            <Route path="/auth/verify-email" element={<AuthVerifyEmail />} />
            <Route path="/auth/forgot-password" element={<AuthForgotPassword />} />
            <Route path="/auth/reset-password" element={<AuthResetPasswordConfirm />} />
            <Route path="/auth/accept-invitation" element={<AuthAcceptInvitation />} />

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