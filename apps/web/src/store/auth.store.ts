'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthUser } from '@hvacflow/shared-types';
import { api, setTokens, clearTokens, beginImpersonation, endImpersonation } from '@/lib/api';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isImpersonating: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loadMe: () => Promise<void>;
  hasPermission: (code: string) => boolean;
  hasDepartment: (deptId: string) => boolean;
  viewAs: (userId: string) => Promise<void>;
  exitViewAs: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      isImpersonating: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { tokens, user } = await api.auth.login(email, password);
          setTokens(tokens.accessToken, tokens.refreshToken);
          set({ user, isAuthenticated: true, isLoading: false, isImpersonating: false });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: () => {
        clearTokens();
        localStorage.removeItem('hvacflow:admin_access_token');
        localStorage.removeItem('hvacflow:admin_refresh_token');
        localStorage.removeItem('hvacflow:impersonating');
        set({ user: null, isAuthenticated: false, isImpersonating: false });
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

      // Admin-only: mint a short-lived, read-only token scoped to another
      // user so you can see exactly what their dashboard looks like.
      viewAs: async (userId: string) => {
        const result = await api.auth.impersonate(userId);
        beginImpersonation(result.accessToken);
        set({ user: result.user, isImpersonating: true, isAuthenticated: true });
      },

      exitViewAs: async () => {
        const restored = endImpersonation();
        if (!restored) {
          get().logout();
          return;
        }
        set({ isImpersonating: false });
        await get().loadMe();
      },
    }),
    {
      name: 'hvacflow:auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated, isImpersonating: state.isImpersonating }),
    },
  ),
);
