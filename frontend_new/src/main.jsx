// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './context/AuthContext'
import AdminDashboard from './views/AdminDashboard' 
import JudgePortal from './views/JudgePortal'
import PartcipantPortal from './views/ParticipantPortal'
import MentorPortal from './views/MentorPortal'


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
    const { role, isLoading } = useAuth();
    if (isLoading) return <div className="p-10 text-gray-500">Loading Auth Context...</div>;
    if (role && role !== 'admin') return <Navigate to={`/${role}`} replace />;
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
            <Route path="/participant" element={<PartcipantPortal />} />
            <Route path="/mentor" element={<MentorPortal />} />
            
            <Route path="/admin" element={
                <ProtectedAdminRoute>
                    <AdminDashboard />
                </ProtectedAdminRoute>
            } />

            <Route path="/" element={<Navigate to="/admin" replace />} />
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