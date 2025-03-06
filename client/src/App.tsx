import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import axios from 'axios';
import CharacterCreation from './pages/CharacterCreation';
import CharacterList from './pages/CharacterList';
import CharacterDetails from './pages/CharacterDetails';
import CampaignCreation from './pages/CampaignCreation';
import CampaignDetails from './pages/CampaignDetails';
import CampaignList from './pages/CampaignList';

interface User {
  id: string;
  username: string;
  email: string;
}

// Configure axios defaults
axios.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
axios.defaults.withCredentials = true; // Enable sending cookies with requests

// Add auth token to all axios requests
axios.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Handle 401 responses
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

const App: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    if (token) {
      fetchUserProfile();
    }
  }, []);

  const fetchUserProfile = async () => {
    try {
      const response = await axios.get('/api/auth/me');
      setUser(response.data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      localStorage.removeItem('token');
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError('');
    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const response = await axios.post('/api/auth/login', {
        email: formData.get('email'),
        password: formData.get('password')
      });

      localStorage.setItem('token', response.data.token);
      setUser(response.data.user);
    } catch (error: any) {
      console.error('Login error:', error);
      setAuthError(error.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError('');
    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const response = await axios.post('/api/auth/register', {
        username: formData.get('username'),
        email: formData.get('email'),
        password: formData.get('password')
      });

      localStorage.setItem('token', response.data.token);
      setUser(response.data.user);
    } catch (error: any) {
      console.error('Registration error:', error);
      setAuthError(error.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-4">D&D AI DM</h2>
            <p className="text-gray-600 mb-8">Sign in to start your adventure</p>
          </div>

          {authError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {authError}
            </div>
          )}

          <div className="space-y-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  name="email"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input
                  type="password"
                  name="password"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
              >
                {loading ? 'Loading...' : 'Sign In'}
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or</span>
              </div>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Username</label>
                <input
                  type="text"
                  name="username"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  name="email"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input
                  type="password"
                  name="password"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600"
              >
                {loading ? 'Loading...' : 'Register'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
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
              <div className="flex items-center">
                <span className="text-gray-600 mr-4">Welcome, {user.username}!</span>
                <button
                  onClick={handleLogout}
                  className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/characters" element={<CharacterList />} />
            <Route path="/characters/create" element={<CharacterCreation />} />
            <Route path="/characters/:id" element={<CharacterDetails />} />
            <Route path="/campaigns" element={<CampaignList />} />
            <Route path="/campaigns/create" element={<CampaignCreation />} />
            <Route path="/campaigns/:id" element={<CampaignDetails />} />
            <Route path="/" element={
              <div className="text-center py-8">
                <h1 className="text-3xl font-bold mb-4">Welcome to D&D AI DM</h1>
                <p className="text-gray-600 mb-8">Create a character or campaign to begin your adventure!</p>
                <div className="space-x-4">
                  <Link
                    to="/characters"
                    className="bg-indigo-500 text-white px-6 py-3 rounded-lg hover:bg-indigo-600 transition-colors"
                  >
                    View Your Characters
                  </Link>
                  <Link
                    to="/campaigns/create"
                    className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Create New Campaign
                  </Link>
                </div>
              </div>
            } />
          </Routes>
        </div>
      </div>
    </Router>
  );
};

export default App; 