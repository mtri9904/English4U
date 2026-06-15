import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

type RealtimeEnvelope = {
    type?: string;
    payload?: unknown;
    timestampUtc?: string;
};

export const REALTIME_BROWSER_EVENT = 'english4u:realtime-event';

const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 15_000;
const KEEPALIVE_INTERVAL_MS = 25_000;
const INVALIDATE_THROTTLE_MS = 600;

const resolveRealtimeWsUrl = () => {
    const apiBaseUrl = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:5237/api';

    try {
        const parsed = new URL(apiBaseUrl);
        const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${wsProtocol}//${parsed.host}/ws/realtime`;
    } catch {
        return 'ws://localhost:5237/ws/realtime';
    }
};

export const useRealtimeSync = (enabled = true) => {
    const queryClient = useQueryClient();
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<number | null>(null);
    const keepaliveTimerRef = useRef<number | null>(null);
    const reconnectAttemptRef = useRef(0);
    const lastInvalidateAtRef = useRef<Record<string, number>>({});

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            return;
        }

        const wsUrl = `${resolveRealtimeWsUrl()}?token=${encodeURIComponent(token)}`;
        let disposed = false;

        const clearTimers = () => {
            if (reconnectTimerRef.current !== null) {
                window.clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }

            if (keepaliveTimerRef.current !== null) {
                window.clearInterval(keepaliveTimerRef.current);
                keepaliveTimerRef.current = null;
            }
        };

        const invalidateThrottled = (key: string, invalidate: () => void) => {
            const now = Date.now();
            const lastAt = lastInvalidateAtRef.current[key] ?? 0;
            if (now - lastAt < INVALIDATE_THROTTLE_MS) {
                return;
            }

            lastInvalidateAtRef.current[key] = now;
            invalidate();
        };

        const handleRealtimeMessage = (rawData: string) => {
            let envelope: RealtimeEnvelope | null = null;
            try {
                envelope = JSON.parse(rawData) as RealtimeEnvelope;
            } catch {
                return;
            }

            window.dispatchEvent(
                new CustomEvent<RealtimeEnvelope>(REALTIME_BROWSER_EVENT, {
                    detail: envelope,
                })
            );

            const eventType = envelope?.type;
            if (!eventType) {
                return;
            }

            if (eventType === 'notifications.changed') {
                invalidateThrottled('notifications.changed', () => {
                    queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
                    queryClient.invalidateQueries({ queryKey: ['client', 'notifications'] });
                });
                return;
            }

            if (eventType === 'exams.changed') {
                invalidateThrottled('exams.changed', () => {
                    queryClient.invalidateQueries({ queryKey: ['exams'] });
                    queryClient.invalidateQueries({ queryKey: ['client', 'practice'] });
                });
                return;
            }

            if (eventType === 'users.presence.changed') {
                invalidateThrottled('users.presence.changed', () => {
                    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
                });
            }
        };

        const scheduleReconnect = () => {
            if (disposed) {
                return;
            }

            const delay = Math.min(
                RECONNECT_BASE_DELAY_MS * (2 ** reconnectAttemptRef.current),
                RECONNECT_MAX_DELAY_MS
            );
            reconnectAttemptRef.current += 1;
            reconnectTimerRef.current = window.setTimeout(connect, delay);
        };

        const connect = () => {
            if (disposed) {
                return;
            }

            const socket = new WebSocket(wsUrl);
            wsRef.current = socket;

            socket.onopen = () => {
                reconnectAttemptRef.current = 0;
                if (keepaliveTimerRef.current === null) {
                    keepaliveTimerRef.current = window.setInterval(() => {
                        if (socket.readyState === WebSocket.OPEN) {
                            socket.send('ping');
                        }
                    }, KEEPALIVE_INTERVAL_MS);
                }
            };

            socket.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    handleRealtimeMessage(event.data);
                }
            };

            socket.onerror = () => {
                socket.close();
            };

            socket.onclose = () => {
                if (keepaliveTimerRef.current !== null) {
                    window.clearInterval(keepaliveTimerRef.current);
                    keepaliveTimerRef.current = null;
                }

                if (!disposed) {
                    scheduleReconnect();
                }
            };
        };

        connect();

        return () => {
            disposed = true;
            clearTimers();

            if (wsRef.current) {
                const socket = wsRef.current;
                wsRef.current = null;
                if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                    socket.close(1000, 'Realtime sync disposed');
                }
            }
        };
    }, [enabled, queryClient]);
};
