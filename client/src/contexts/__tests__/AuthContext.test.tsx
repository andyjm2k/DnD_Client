import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../AuthContext';
import * as authService from '../../services/authService';

// Mock the auth service
jest.mock('../../services/authService');

const mockAuthService = authService as jest.Mocked<typeof authService>;

// Test component to access auth context
const TestComponent = () => {
  const { user, loading, error, login, logout } = useAuth();
  
  return (
    <div>
      <div data-testid="user">{user ? JSON.stringify(user) : 'no-user'}</div>
      <div data-testid="loading">{loading ? 'loading' : 'not-loading'}</div>
      <div data-testid="error">{error || 'no-error'}</div>
      <button onClick={() => login('test@example.com', 'password')} data-testid="login-btn">
        Login
      </button>
      <button onClick={() => logout()} data-testid="logout-btn">
        Logout
      </button>
    </div>
  );
};

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        {component}
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('AuthProvider', () => {
    it('renders children correctly', () => {
      renderWithProviders(<TestComponent />);
      
      expect(screen.getByTestId('user')).toBeInTheDocument();
      expect(screen.getByTestId('loading')).toBeInTheDocument();
      expect(screen.getByTestId('error')).toBeInTheDocument();
    });

    it('initializes with no user and not loading', () => {
      renderWithProviders(<TestComponent />);
      
      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
      expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      expect(screen.getByTestId('error')).toHaveTextContent('no-error');
    });

    it('loads user from localStorage on mount', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        roles: 'player'
      };

      localStorage.setItem('user', JSON.stringify(mockUser));
      localStorage.setItem('token', 'mock-token');

      renderWithProviders(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockUser));
      });
    });

    it('handles invalid localStorage data gracefully', () => {
      localStorage.setItem('user', 'invalid-json');
      localStorage.setItem('token', 'mock-token');

      renderWithProviders(<TestComponent />);
      
      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    });
  });

  describe('login function', () => {
    it('successfully logs in user', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        roles: 'player'
      };

      const mockResponse = {
        user: mockUser,
        token: 'mock-jwt-token'
      };

      mockAuthService.login.mockResolvedValue(mockResponse);

      renderWithProviders(<TestComponent />);

      const loginButton = screen.getByTestId('login-btn');
      
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(mockAuthService.login).toHaveBeenCalledWith('test@example.com', 'password');
        expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockUser));
        expect(localStorage.getItem('user')).toBe(JSON.stringify(mockUser));
        expect(localStorage.getItem('token')).toBe('mock-jwt-token');
      });
    });

    it('handles login errors', async () => {
      const errorMessage = 'Invalid credentials';
      mockAuthService.login.mockRejectedValue(new Error(errorMessage));

      renderWithProviders(<TestComponent />);

      const loginButton = screen.getByTestId('login-btn');
      
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent(errorMessage);
        expect(screen.getByTestId('user')).toHaveTextContent('no-user');
      });
    });

    it('shows loading state during login', async () => {
      mockAuthService.login.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );

      renderWithProviders(<TestComponent />);

      const loginButton = screen.getByTestId('login-btn');
      
      act(() => {
        loginButton.click();
      });

      expect(screen.getByTestId('loading')).toHaveTextContent('loading');
    });

    it('clears error when login starts', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        roles: 'player'
      };

      const mockResponse = {
        user: mockUser,
        token: 'mock-jwt-token'
      };

      mockAuthService.login.mockResolvedValue(mockResponse);

      renderWithProviders(<TestComponent />);

      // Set initial error
      act(() => {
        screen.getByTestId('error').textContent = 'Previous error';
      });

      const loginButton = screen.getByTestId('login-btn');
      
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('no-error');
      });
    });
  });

  describe('logout function', () => {
    it('successfully logs out user', async () => {
      // Set up initial logged in state
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        roles: 'player'
      };

      localStorage.setItem('user', JSON.stringify(mockUser));
      localStorage.setItem('token', 'mock-token');

      mockAuthService.logout.mockResolvedValue({ success: true });

      renderWithProviders(<TestComponent />);

      // Wait for user to be loaded
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockUser));
      });

      const logoutButton = screen.getByTestId('logout-btn');
      
      await act(async () => {
        logoutButton.click();
      });

      await waitFor(() => {
        expect(mockAuthService.logout).toHaveBeenCalled();
        expect(screen.getByTestId('user')).toHaveTextContent('no-user');
        expect(localStorage.getItem('user')).toBeNull();
        expect(localStorage.getItem('token')).toBeNull();
      });
    });

    it('handles logout errors gracefully', async () => {
      // Set up initial logged in state
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        roles: 'player'
      };

      localStorage.setItem('user', JSON.stringify(mockUser));
      localStorage.setItem('token', 'mock-token');

      mockAuthService.logout.mockRejectedValue(new Error('Logout failed'));

      renderWithProviders(<TestComponent />);

      // Wait for user to be loaded
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockUser));
      });

      const logoutButton = screen.getByTestId('logout-btn');
      
      await act(async () => {
        logoutButton.click();
      });

      await waitFor(() => {
        // Should still logout locally even if server logout fails
        expect(screen.getByTestId('user')).toHaveTextContent('no-user');
        expect(localStorage.getItem('user')).toBeNull();
        expect(localStorage.getItem('token')).toBeNull();
      });
    });

    it('clears user data even when not logged in', async () => {
      mockAuthService.logout.mockRejectedValue(new Error('Logout failed'));

      renderWithProviders(<TestComponent />);

      const logoutButton = screen.getByTestId('logout-btn');
      
      await act(async () => {
        logoutButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('no-user');
        expect(localStorage.getItem('user')).toBeNull();
        expect(localStorage.getItem('token')).toBeNull();
      });
    });
  });

  describe('useAuth hook', () => {
    it('throws error when used outside AuthProvider', () => {
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = jest.fn();

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useAuth must be used within an AuthProvider');

      console.error = originalError;
    });
  });

  describe('token management', () => {
    it('sets authorization header when token is available', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        roles: 'player'
      };

      const mockResponse = {
        user: mockUser,
        token: 'mock-jwt-token'
      };

      mockAuthService.login.mockResolvedValue(mockResponse);

      renderWithProviders(<TestComponent />);

      const loginButton = screen.getByTestId('login-btn');
      
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(localStorage.getItem('token')).toBe('mock-jwt-token');
      });
    });

    it('removes authorization header on logout', async () => {
      localStorage.setItem('token', 'mock-token');

      mockAuthService.logout.mockResolvedValue({ success: true });

      renderWithProviders(<TestComponent />);

      const logoutButton = screen.getByTestId('logout-btn');
      
      await act(async () => {
        logoutButton.click();
      });

      await waitFor(() => {
        expect(localStorage.getItem('token')).toBeNull();
      });
    });
  });

  describe('error handling', () => {
    it('clears error when new login attempt starts', async () => {
      mockAuthService.login.mockRejectedValue(new Error('First error'));

      renderWithProviders(<TestComponent />);

      const loginButton = screen.getByTestId('login-btn');
      
      // First login attempt - should show error
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('First error');
      });

      // Second login attempt - should clear error first
      mockAuthService.login.mockResolvedValue({
        user: { id: 'user-123', username: 'testuser' },
        token: 'mock-token'
      });

      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('no-error');
      });
    });

    it('handles network errors during login', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Network error'));

      renderWithProviders(<TestComponent />);

      const loginButton = screen.getByTestId('login-btn');
      
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Network error');
      });
    });
  });

  describe('loading states', () => {
    it('shows loading during initial user load', async () => {
      // Simulate slow localStorage access
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = jest.fn(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve(originalGetItem.call(localStorage, 'user')), 50);
        });
      });

      renderWithProviders(<TestComponent />);

      // Should show loading initially
      expect(screen.getByTestId('loading')).toHaveTextContent('loading');

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });
    });

    it('shows loading during logout', async () => {
      localStorage.setItem('user', JSON.stringify({ id: 'user-123' }));
      localStorage.setItem('token', 'mock-token');

      mockAuthService.logout.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );

      renderWithProviders(<TestComponent />);

      // Wait for user to be loaded
      await waitFor(() => {
        expect(screen.getByTestId('user')).not.toHaveTextContent('no-user');
      });

      const logoutButton = screen.getByTestId('logout-btn');
      
      act(() => {
        logoutButton.click();
      });

      expect(screen.getByTestId('loading')).toHaveTextContent('loading');
    });
  });
});

