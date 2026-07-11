'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  WsTaskCreated,
  WsTaskStatusChanged,
  WsTaskUpdated,
  WsPartProgressChanged,
  WsUnitProgressChanged,
  WsChecklistUpdated,
} from '@hvacflow/shared-types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;

  socket = io(`${WS_URL}/realtime`, {
    auth: { token },
    transports: ['websocket'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('[WS] Connected to realtime gateway');
  });

  socket.on('disconnect', (reason) => {
    console.log('[WS] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[WS] Connection error:', err.message);
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

type WsEventMap = {
  'task.created': WsTaskCreated;
  'task.statusChanged': WsTaskStatusChanged;
  'task.updated': WsTaskUpdated;
  'part.progressChanged': WsPartProgressChanged;
  'unit.progressChanged': WsUnitProgressChanged;
  'checklist.updated': WsChecklistUpdated;
};

export function useWsEvent<K extends keyof WsEventMap>(
  event: K,
  handler: (payload: WsEventMap[K]) => void,
  deps: unknown[] = [],
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const s = socket;
    if (!s) return;

    const listener = (payload: WsEventMap[K]) => handlerRef.current(payload);
    s.on(event as string, listener);

    return () => {
      s.off(event as string, listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps]);
}

export function useSubscribeUnit(unitId: string | null) {
  useEffect(() => {
    if (!unitId || !socket) return;
    socket.emit('subscribe:unit', unitId);
    return () => {
      socket?.emit('unsubscribe:unit', unitId);
    };
  }, [unitId]);
}

export function useSubscribeTask(taskId: string | null) {
  useEffect(() => {
    if (!taskId || !socket) return;
    socket.emit('subscribe:task', taskId);
  }, [taskId]);
}
