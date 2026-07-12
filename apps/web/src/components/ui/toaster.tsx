'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';

export function Toaster() {
  return (
    <ToastPrimitive.Provider swipeDirection="right">
      <ToastPrimitive.Viewport
        className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 sm:max-w-[420px]"
      />
    </ToastPrimitive.Provider>
  );
}
