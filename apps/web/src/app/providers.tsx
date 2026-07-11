'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { connectSocket } from '@/lib/websocket';
import { useAuthStore } from '@/store/auth.store';

function WebSocketInitializer() {
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      const token = localStorage.getItem('hvacflow:access_token');
      if (token) {
        connectSocket(token);
      }
    }
  }, [isAuthenticated]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error: any) => {
              if (error?.status === 401 || error?.status === 403) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketInitializer />
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
