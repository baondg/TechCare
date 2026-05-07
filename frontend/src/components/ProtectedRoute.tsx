import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

const getSafeRedirectByRole = (role?: string): string => {
  switch (role) {
    case 'patient':
      return '/patient/dashboard';
    case 'doctor':
      return '/doctor/dashboard';
    case 'nurse':
      return '/nurse/dashboard';
    case 'technician':
      return '/technician/dashboard';
    case 'admin':
      return '/admin/dashboard';
    default:
      return '/';
  }
};

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login page and save the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role if required
  if (requiredRole && user?.role !== requiredRole) {
    return (
      <Navigate
        to={getSafeRedirectByRole(user?.role)}
        state={{ deniedFrom: location.pathname }}
        replace
      />
    );
  }

  return <>{children}</>;
};
