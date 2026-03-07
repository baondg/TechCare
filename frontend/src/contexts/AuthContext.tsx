<<<<<<< HEAD
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
=======
<<<<<<< HEAD
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
=======
import { useState, useEffect } from 'react';

// Simplified auth hook - no AuthProvider needed
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend

interface User {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  register: (userData: {
    username: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    age?: number;
  }) => Promise<{ success: boolean; error?: string }>;
  logout: (allDevices?: boolean) => Promise<void>;
  refreshToken: () => Promise<boolean>;
  checkSession: () => Promise<void>;
}

<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> backend
const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Auto-refresh token before it expires
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('user');
    
    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        setIsAuthenticated(true);
        
        // Set up auto-refresh (every 10 minutes)
        const refreshInterval = setInterval(() => {
          refreshToken();
        }, 10 * 60 * 1000);
        
        return () => clearInterval(refreshInterval);
      } catch (error) {
        console.error('Error parsing stored user:', error);
        handleLogout();
      }
    }
    
    setIsLoading(false);
  }, []);

  const handleLogout = () => {
<<<<<<< HEAD
=======
=======
export const useAuth = (): AuthContextType => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('authToken');
      const userStr = localStorage.getItem('user');
      
      if (token && userStr) {
        try {
          setUser(JSON.parse(userStr));
          setIsAuthenticated(true);
        } catch (e) {
          console.error('Failed to parse user data', e);
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          setUser(null);
          setIsAuthenticated(false);
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setIsLoading(false);
    };

    checkAuth();
    
    // Listen for storage events to sync across tabs/windows
    window.addEventListener('storage', checkAuth);
    return () => window.removeEventListener('storage', checkAuth);
  }, []);

  const logout = () => {
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('sessionExpiresAt');
    setUser(null);
    setIsAuthenticated(false);
<<<<<<< HEAD
=======
<<<<<<< HEAD
=======
    window.location.href = '/login';
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend
  };

  const logout = async (allDevices = false): Promise<void> => {
    try {
      const token = localStorage.getItem('authToken');
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ allDevices })
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      handleLogout();
      window.location.href = '/login';
    }
  };

  const login = async (
    username: string, 
    password: string, 
    rememberMe = false
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password, rememberMe }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('refreshToken', data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        if (data.expiresAt) {
          localStorage.setItem('sessionExpiresAt', data.expiresAt);
        }
<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> backend
        
        setUser(data.user);
        setIsAuthenticated(true);
        
<<<<<<< HEAD
=======
=======
        setUser(data.user);
        setIsAuthenticated(true);
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend
        return { success: true };
      } else {
        return { 
          success: false, 
          error: data.error || 'Login failed' 
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: 'Network error. Please try again.' 
      };
    }
  };

  const register = async (userData: {
    username: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    age?: number;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('refreshToken', data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.user));
<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> backend
        
        setUser(data.user);
        setIsAuthenticated(true);
        
<<<<<<< HEAD
=======
=======
        setUser(data.user);
        setIsAuthenticated(true);
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend
        return { success: true };
      } else {
        return { 
          success: false, 
          error: data.error || 'Registration failed' 
        };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return { 
        success: false, 
        error: 'Network error. Please try again.' 
      };
    }
  };

<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> backend
  const refreshToken = async (): Promise<boolean> => {
    try {
      const refreshTokenValue = localStorage.getItem('refreshToken');
      
      if (!refreshTokenValue) {
        handleLogout();
        return false;
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: refreshTokenValue }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        setUser(data.user);
        setIsAuthenticated(true);
        
        return true;
      } else {
        handleLogout();
        return false;
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      handleLogout();
      return false;
    }
<<<<<<< HEAD
=======
=======
  return {
    user,
    isLoading,
    isAuthenticated,
    login,
    register,
    logout,
>>>>>>> 9d41cd19 (TC-2801: Fix the FE branch and modify gitignore)
>>>>>>> backend
  };

  const checkSession = async (): Promise<void> => {
    try {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        handleLogout();
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setUser(data.user);
        setIsAuthenticated(true);
      } else if (data.code === 'TOKEN_EXPIRED' || data.code === 'SESSION_EXPIRED') {
        // Try to refresh token
        const refreshed = await refreshToken();
        if (!refreshed) {
          handleLogout();
          window.location.href = '/login';
        }
      } else {
        handleLogout();
      }
    } catch (error) {
      console.error('Session check error:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        register,
        logout,
        refreshToken,
        checkSession
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
