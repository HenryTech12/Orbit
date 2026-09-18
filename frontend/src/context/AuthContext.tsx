import React, { createContext, useContext, useState } from 'react';

export type UserRole = 'student' | 'admin';

interface User {
  id: string;
  name: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loginAs: (role: UserRole) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Default to stored role or student; in production, this comes from decoding a JWT
  const [user, setUser] = useState<User | null>(() => {
    const savedRole = (localStorage.getItem('sentinel_role') as UserRole) || 'student';
    return { id: 'u-1', name: savedRole === 'admin' ? 'Coordinator Admin' : 'Cohort Student', role: savedRole };
  });

  const loginAs = (role: UserRole) => {
    localStorage.setItem('sentinel_role', role);
    setUser({
      id: 'u-1',
      name: role === 'admin' ? 'Coordinator Admin' : 'Cohort Student',
      role,
    });
  };

  const logout = () => {
    localStorage.removeItem('sentinel_role');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAdmin: user?.role === 'admin', loginAs, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};