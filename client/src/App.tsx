import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginForm, RegisterForm, PasswordResetForm, ProtectedRoute } from './components/auth';
import CharacterCreation from './pages/CharacterCreation';
import CharacterList from './pages/CharacterList';
import CharacterDetails from './pages/CharacterDetails';
import CampaignCreation from './pages/CampaignCreation';
import CampaignDetails from './pages/CampaignDetails';
import CampaignList from './pages/CampaignList';

// Axios configuration is handled by the auth service

// Main App component that includes routing
const AppContent: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset'>('login');
  const [resetToken, setResetToken] = useState<string>('');

  // Handle successful authentication
  const handleAuthSuccess = () => {
    // Could add redirect logic here based on intended destination
  };

  // If not authenticated, show authentication forms
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="flex items-center justify-center min-h-screen py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">D&D AI Dungeon Master</h2>
              <p className="text-gray-600">Your AI-powered Dungeons & Dragons companion</p>
            </div>

            {authMode === 'login' && (
              <LoginForm
                onSuccess={handleAuthSuccess}
                onSwitchToRegister={() => setAuthMode('register')}
                onSwitchToPasswordReset={() => setAuthMode('reset')}
              />
            )}

            {authMode === 'register' && (
              <RegisterForm
                onSuccess={handleAuthSuccess}
                onSwitchToLogin={() => setAuthMode('login')}
              />
            )}

            {authMode === 'reset' && (
              <PasswordResetForm
                mode="request"
                onSuccess={() => {
                  alert('Password reset link sent! Check your email.');
                  setAuthMode('login');
                }}
                onSwitchToLogin={() => setAuthMode('login')}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Authenticated user interface
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Link to="/" className="text-xl font-bold text-gray-800">D&D AI DM</Link>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link to="/" className="text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-gray-300">
                  Home
                </Link>
                <Link to="/characters" className="text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-gray-300">
                  My Characters
                </Link>
                <Link to="/campaigns" className="text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-gray-300">
                  My Campaigns
                </Link>
                <Link to="/campaigns/create" className="text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-gray-300">
                  Create Campaign
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">
                Welcome, {user?.displayName || user?.username}!
              </span>
              <button
                onClick={logout}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          {/* Protected Routes */}
          <Route path="/characters" element={
            <ProtectedRoute>
              <CharacterList />
            </ProtectedRoute>
          } />
          <Route path="/characters/create" element={
            <ProtectedRoute>
              <CharacterCreation />
            </ProtectedRoute>
          } />
          <Route path="/characters/:id" element={
            <ProtectedRoute>
              <CharacterDetails />
            </ProtectedRoute>
          } />
          <Route path="/campaigns" element={
            <ProtectedRoute>
              <CampaignList />
            </ProtectedRoute>
          } />
          <Route path="/campaigns/create" element={
            <ProtectedRoute>
              <CampaignCreation />
            </ProtectedRoute>
          } />
          <Route path="/campaigns/:id" element={
            <ProtectedRoute>
              <CampaignDetails />
            </ProtectedRoute>
          } />

          {/* Public routes that redirect if authenticated */}
          <Route path="/login" element={
            <Navigate to="/" replace />
          } />
          <Route path="/register" element={
            <Navigate to="/" replace />
          } />

          {/* Home/Dashboard */}
          <Route path="/" element={
            <ProtectedRoute>
              <div className="text-center py-8">
                <h1 className="text-3xl font-bold mb-4">Welcome to D&D AI DM</h1>
                <p className="text-gray-600 mb-8">Create a character or campaign to begin your adventure!</p>
                <div className="space-x-4">
                  <Link
                    to="/characters"
                    className="bg-indigo-500 text-white px-6 py-3 rounded-lg hover:bg-indigo-600 transition-colors inline-block"
                  >
                    View Your Characters
                  </Link>
                  <Link
                    to="/campaigns/create"
                    className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors inline-block"
                  >
                    Create New Campaign
                  </Link>
                </div>
              </div>
            </ProtectedRoute>
          } />
        </Routes>
      </div>
    </div>
  );
};

// Main App component with AuthProvider
const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
};

export default App; 