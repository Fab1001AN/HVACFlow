'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthUser } from '@hvacflow/shared-types';
import { api, setTokens, clearTokens } from '@/lib/api';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loadMe: () => Promise<void>;
  hasPermission: (code: string) => boolean;
  hasDepartment: (deptId: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { tokens, user } = await api.auth.login(email, password);
          setTokens(tokens.accessToken, tokens.refreshToken);
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: () => {
        clearTokens();
        set({ user: null, isAuthenticated: false });
        window.location.href = '/login';
      },

      loadMe: async () => {
        set({ isLoading: true });
        try {
          const user = await api.auth.me();
          set({ user, isAuthenticated: true, isLoading: false });
        } catch {
          clearTokens();
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      hasPermission: (code) => {
        const { user } = get();
        return user?.permissions.includes(code) ?? false;
      },

      hasDepartment: (deptId) => {
        const { user } = get();
        return user?.departments.some((d) => d.departmentId === deptId) ?? false;
      },
    }),
    {
      name: 'hvacflow:auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
