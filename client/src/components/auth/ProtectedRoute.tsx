import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requiredRole?: string;
  requiredPermission?: string;
  campaignId?: string;
  fallbackPath?: string;
  loadingComponent?: React.ComponentType;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
  requiredRole,
  requiredPermission,
  campaignId,
  fallbackPath = '/',
  loadingComponent: LoadingComponent
}) => {
  const {
    user,
    isAuthenticated,
    isLoading,
    checkPermission,
    checkPermissions
  } = useAuth();

  const location = useLocation();
  const [permissionCheck, setPermissionCheck] = useState<{
    loading: boolean;
    hasAccess: boolean;
    error: string | null;
  }>({
    loading: false,
    hasAccess: true,
    error: null
  });

  // Handle authentication check
  if (isLoading) {
    return LoadingComponent ? <LoadingComponent /> : (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Check authentication requirement
  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If auth is not required and user is not authenticated, allow access
  if (!requireAuth && !isAuthenticated) {
    return <>{children}</>;
  }

  // Check role requirement
  if (requiredRole && user) {
    const userRoles = user.roles ? user.roles.split(',') : [];
    if (!userRoles.includes(requiredRole)) {
      return <Navigate to={fallbackPath} replace />;
    }
  }

  // Check permission requirement
  useEffect(() => {
    const checkAccess = async () => {
      if (!requiredPermission || !campaignId || !isAuthenticated) {
        setPermissionCheck({ loading: false, hasAccess: true, error: null });
        return;
      }

      try {
        setPermissionCheck({ loading: true, hasAccess: false, error: null });
        const result = await checkPermission(campaignId, requiredPermission);
        setPermissionCheck({
          loading: false,
          hasAccess: result.hasPermission,
          error: null
        });
      } catch (error) {
        setPermissionCheck({
          loading: false,
          hasAccess: false,
          error: 'Failed to check permissions'
        });
      }
    };

    checkAccess();
  }, [requiredPermission, campaignId, isAuthenticated, checkPermission]);

  // Show loading while checking permissions
  if (permissionCheck.loading) {
    return LoadingComponent ? <LoadingComponent /> : (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Check permission access
  if (requiredPermission && !permissionCheck.hasAccess) {
    return <Navigate to={fallbackPath} replace />;
  }

  // All checks passed, render children
  return <>{children}</>;
};

// Higher-order component for protecting routes
export const withAuth = <P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<ProtectedRouteProps, 'children'> = {}
) => {
  return (props: P) => (
    <ProtectedRoute {...options}>
      <Component {...props} />
    </ProtectedRoute>
  );
};

// Hook for checking permissions in components
export const usePermissions = (campaignId?: string) => {
  const { checkPermission, checkPermissions } = useAuth();

  return {
    checkPermission: (permission: string) => {
      if (!campaignId) return Promise.resolve({ hasPermission: false });
      return checkPermission(campaignId, permission);
    },

    checkPermissions: (permissions: string[], requireAll = false) => {
      if (!campaignId) return Promise.resolve({ hasPermission: false });
      return checkPermissions(campaignId, permissions, requireAll);
    },

    hasPermission: async (permission: string): Promise<boolean> => {
      if (!campaignId) return false;
      try {
        const result = await checkPermission(campaignId, permission);
        return result.hasPermission;
      } catch {
        return false;
      }
    },

    hasAnyPermission: async (permissions: string[]): Promise<boolean> => {
      if (!campaignId) return false;
      try {
        const result = await checkPermissions(campaignId, permissions, false);
        return result.hasPermission;
      } catch {
        return false;
      }
    },

    hasAllPermissions: async (permissions: string[]): Promise<boolean> => {
      if (!campaignId) return false;
      try {
        const result = await checkPermissions(campaignId, permissions, true);
        return result.hasPermission;
      } catch {
        return false;
      }
    }
  };
};

export default ProtectedRoute;
