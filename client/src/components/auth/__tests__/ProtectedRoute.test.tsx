import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../../contexts/AuthContext';
import ProtectedRoute from '../ProtectedRoute';

// Mock the auth context
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Test components
const TestComponent = () => <div>Protected Content</div>;
const LoginComponent = () => <div>Login Page</div>;

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginComponent />} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <TestComponent />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/protected" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('ProtectedRoute Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('renders protected content when user is authenticated', async () => {
    const mockUser = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User',
      emailVerified: true,
      roles: 'player'
    };

    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn()
    });

    renderWithProviders(<ProtectedRoute><TestComponent /></ProtectedRoute>);

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('redirects to login when user is not authenticated', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn()
    });

    renderWithProviders(<ProtectedRoute><TestComponent /></ProtectedRoute>);

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('shows loading spinner while authentication is being checked', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: true,
      error: null,
      login: jest.fn(),
      logout: jest.fn()
    });

    renderWithProviders(<ProtectedRoute><TestComponent /></ProtectedRoute>);

    // Should show loading state
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  it('renders children when user is authenticated and not loading', async () => {
    const mockUser = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User',
      emailVerified: true,
      roles: 'player'
    };

    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn()
    });

    const CustomComponent = () => <div>Custom Protected Content</div>;

    renderWithProviders(
      <ProtectedRoute>
        <CustomComponent />
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Custom Protected Content')).toBeInTheDocument();
    });
  });

  it('handles multiple protected routes correctly', async () => {
    const mockUser = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User',
      emailVerified: true,
      roles: 'player'
    };

    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn()
    });

    const renderMultipleRoutes = () => {
      return render(
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginComponent />} />
              <Route
                path="/route1"
                element={
                  <ProtectedRoute>
                    <div>Route 1 Content</div>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/route2"
                element={
                  <ProtectedRoute>
                    <div>Route 2 Content</div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      );
    };

    renderMultipleRoutes();

    await waitFor(() => {
      expect(screen.getByText('Route 1 Content')).toBeInTheDocument();
    });
  });

  it('preserves route parameters when redirecting', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn()
    });

    const renderWithParams = () => {
      return render(
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginComponent />} />
              <Route
                path="/protected/:id"
                element={
                  <ProtectedRoute>
                    <TestComponent />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      );
    };

    renderWithParams();

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  it('handles authentication state changes', async () => {
    const mockLogin = jest.fn();
    const mockLogout = jest.fn();

    // Start with no user
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      error: null,
      login: mockLogin,
      logout: mockLogout
    });

    const { rerender } = renderWithProviders(<ProtectedRoute><TestComponent /></ProtectedRoute>);

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });

    // Change to authenticated user
    const mockUser = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User',
      emailVerified: true,
      roles: 'player'
    };

    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      login: mockLogin,
      logout: mockLogout
    });

    rerender(
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginComponent />} />
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <TestComponent />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/protected" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('handles error state from auth context', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      error: 'Authentication error',
      login: jest.fn(),
      logout: jest.fn()
    });

    renderWithProviders(<ProtectedRoute><TestComponent /></ProtectedRoute>);

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });

    // Error should not prevent redirect to login
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('works with nested protected routes', async () => {
    const mockUser = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User',
      emailVerified: true,
      roles: 'player'
    };

    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn()
    });

    const NestedComponent = () => (
      <div>
        <h1>Parent Content</h1>
        <ProtectedRoute>
          <div>Nested Content</div>
        </ProtectedRoute>
      </div>
    );

    const renderNested = () => {
      return render(
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginComponent />} />
              <Route
                path="/nested"
                element={
                  <ProtectedRoute>
                    <NestedComponent />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      );
    };

    renderNested();

    await waitFor(() => {
      expect(screen.getByText('Parent Content')).toBeInTheDocument();
      expect(screen.getByText('Nested Content')).toBeInTheDocument();
    });
  });

  it('handles loading state transitions', async () => {
    const mockLogin = jest.fn();
    const mockLogout = jest.fn();

    // Start with loading
    mockUseAuth.mockReturnValue({
      user: null,
      loading: true,
      error: null,
      login: mockLogin,
      logout: mockLogout
    });

    const { rerender } = renderWithProviders(<ProtectedRoute><TestComponent /></ProtectedRoute>);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    // Transition to not loading, but no user
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      error: null,
      login: mockLogin,
      logout: mockLogout
    });

    rerender(
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginComponent />} />
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <TestComponent />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/protected" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });

    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it('preserves query parameters when redirecting', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn()
    });

    const renderWithQuery = () => {
      return render(
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginComponent />} />
              <Route
                path="/protected"
                element={
                  <ProtectedRoute>
                    <TestComponent />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      );
    };

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  it('handles edge case with null children', async () => {
    const mockUser = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User',
      emailVerified: true,
      roles: 'player'
    };

    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn()
    });

    renderWithProviders(<ProtectedRoute>{null}</ProtectedRoute>);

    await waitFor(() => {
      // Should not crash, but also not render anything
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  it('handles edge case with undefined children', async () => {
    const mockUser = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User',
      emailVerified: true,
      roles: 'player'
    };

    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn()
    });

    renderWithProviders(<ProtectedRoute>{undefined}</ProtectedRoute>);

    await waitFor(() => {
      // Should not crash, but also not render anything
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });
});

