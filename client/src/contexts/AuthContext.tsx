import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import authService, {
  User,
  LoginCredentials,
  RegisterData,
  PasswordResetRequest,
  PasswordReset,
  ProfileUpdate,
  SessionInfo
} from '../services/authService';

// Auth state interface
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  sessions: SessionInfo[];
  currentSession: { ipAddress: string; userAgent: string } | null;
}

// Auth actions
type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SESSIONS'; payload: { sessions: SessionInfo[]; currentSession: { ipAddress: string; userAgent: string } } }
  | { type: 'LOGOUT' }
  | { type: 'CLEAR_ERROR' };

// Auth context interface
interface AuthContextType extends AuthState {
  // Authentication methods
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;

  // Profile management
  updateProfile: (updates: ProfileUpdate) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;

  // Email verification
  verifyEmail: (token: string) => Promise<void>;

  // Password reset
  requestPasswordReset: (data: PasswordResetRequest) => Promise<void>;
  resetPassword: (data: PasswordReset) => Promise<void>;

  // Session management
  loadSessions: () => Promise<void>;
  terminateSession: (sessionId: string) => Promise<void>;

  // RBAC methods
  checkPermission: (campaignId: string, permission: string) => Promise<{ hasPermission: boolean }>;
  checkPermissions: (campaignId: string, permissions: string[], requireAll?: boolean) => Promise<{ hasPermission: boolean }>;

  // Utility methods
  clearError: () => void;
  refreshUser: () => Promise<void>;
}

// Initial state
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  sessions: [],
  currentSession: null
};

// Auth reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload,
        isLoading: false,
        error: null
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isLoading: false
      };

    case 'SET_SESSIONS':
      return {
        ...state,
        sessions: action.payload.sessions,
        currentSession: action.payload.currentSession
      };

    case 'LOGOUT':
      return {
        ...initialState,
        isLoading: false
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null
      };

    default:
      return state;
  }
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth provider props
interface AuthProviderProps {
  children: ReactNode;
}

// Auth provider component
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Initialize authentication on mount
  useEffect(() => {
    initializeAuth();
  }, []);

  // Initialize authentication state
  const initializeAuth = async () => {
    try {
      const token = authService.getStoredToken();

      if (token) {
        authService.setAuthToken(token);

        try {
          const user = await authService.getCurrentUser();
          dispatch({ type: 'SET_USER', payload: user });
        } catch (error) {
          // Token might be invalid, clear it
          authService.setAuthToken(null);
          dispatch({ type: 'SET_USER', payload: null });
        }
      } else {
        dispatch({ type: 'SET_USER', payload: null });
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      dispatch({ type: 'SET_USER', payload: null });
    }
  };

  // Authentication methods
  const login = async (credentials: LoginCredentials) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'CLEAR_ERROR' });

      const response = await authService.login(credentials);
      authService.setAuthToken(response.token);

      dispatch({ type: 'SET_USER', payload: response.user });
    } catch (error: any) {
      const errorMessage = authService.handleAuthError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const register = async (data: RegisterData) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'CLEAR_ERROR' });

      const response = await authService.register(data);
      authService.setAuthToken(response.token);

      dispatch({ type: 'SET_USER', payload: response.user });
    } catch (error: any) {
      const errorMessage = authService.handleAuthError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      authService.setAuthToken(null);
      dispatch({ type: 'LOGOUT' });
    }
  };

  const logoutAll = async () => {
    try {
      await authService.logoutAll();
    } catch (error) {
      console.error('Logout all error:', error);
    } finally {
      authService.setAuthToken(null);
      dispatch({ type: 'LOGOUT' });
    }
  };

  // Profile management
  const updateProfile = async (updates: ProfileUpdate) => {
    try {
      dispatch({ type: 'CLEAR_ERROR' });
      const updatedUser = await authService.updateProfile(updates);
      dispatch({ type: 'SET_USER', payload: updatedUser });
    } catch (error: any) {
      const errorMessage = authService.handleAuthError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      dispatch({ type: 'CLEAR_ERROR' });
      await authService.changePassword(currentPassword, newPassword);
    } catch (error: any) {
      const errorMessage = authService.handleAuthError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  // Email verification
  const verifyEmail = async (token: string) => {
    try {
      dispatch({ type: 'CLEAR_ERROR' });
      await authService.verifyEmail(token);

      // Refresh user data to get updated emailVerified status
      if (state.user) {
        const updatedUser = await authService.getCurrentUser();
        dispatch({ type: 'SET_USER', payload: updatedUser });
      }
    } catch (error: any) {
      const errorMessage = authService.handleAuthError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  // Password reset
  const requestPasswordReset = async (data: PasswordResetRequest) => {
    try {
      dispatch({ type: 'CLEAR_ERROR' });
      await authService.requestPasswordReset(data);
    } catch (error: any) {
      const errorMessage = authService.handleAuthError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const resetPassword = async (data: PasswordReset) => {
    try {
      dispatch({ type: 'CLEAR_ERROR' });
      await authService.resetPassword(data);
    } catch (error: any) {
      const errorMessage = authService.handleAuthError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  // Session management
  const loadSessions = async () => {
    try {
      const sessionData = await authService.getSessions();
      dispatch({ type: 'SET_SESSIONS', payload: sessionData });
    } catch (error: any) {
      const errorMessage = authService.handleAuthError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const terminateSession = async (sessionId: string) => {
    try {
      await authService.terminateSession(sessionId);
      // Reload sessions to reflect the change
      await loadSessions();
    } catch (error: any) {
      const errorMessage = authService.handleAuthError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  // Utility methods
  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const refreshUser = async () => {
    try {
      if (state.isAuthenticated) {
        const user = await authService.getCurrentUser();
        dispatch({ type: 'SET_USER', payload: user });
      }
    } catch (error: any) {
      const errorMessage = authService.handleAuthError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      // If refresh fails, user might be logged out
      if (error.response?.status === 401) {
        logout();
      }
    }
  };

  // RBAC methods
  const checkPermission = async (campaignId: string, permission: string) => {
    try {
      return await authService.checkPermission(campaignId, permission);
    } catch (error: any) {
      const errorMessage = authService.handleAuthError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const checkPermissions = async (campaignId: string, permissions: string[], requireAll = false) => {
    try {
      return await authService.checkPermissions(campaignId, permissions, requireAll);
    } catch (error: any) {
      const errorMessage = authService.handleAuthError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  // Context value
  const contextValue: AuthContextType = {
    ...state,
    login,
    register,
    logout,
    logoutAll,
    updateProfile,
    changePassword,
    verifyEmail,
    requestPasswordReset,
    resetPassword,
    loadSessions,
    terminateSession,
    checkPermission,
    checkPermissions,
    clearError,
    refreshUser
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
