import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { COPILOT_PANEL_STORAGE_KEY } from '../constants/reviewCopilot.constants';
import { clampPanelWidth, getInitialPanelWidth } from '../utils/reviewCopilotMarkdown.utils';

export const useCopilotDrawerResize = (open: boolean, onReservedWidthChange?: (nextWidth: number) => void) => {
    const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
    const [viewportWidth, setViewportWidth] = useState(() => (
        typeof window === 'undefined' ? 1440 : window.innerWidth
    ));
    const [panelWidth, setPanelWidth] = useState(getInitialPanelWidth);

    const actualPanelWidth = clampPanelWidth(panelWidth, viewportWidth);
    const canResize = viewportWidth > 980 && actualPanelWidth < viewportWidth - 18;
    const occupiedWidth = actualPanelWidth;

    useEffect(() => {
        const handleResize = () => setViewportWidth(window.innerWidth);

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        setPanelWidth((current) => clampPanelWidth(current, viewportWidth));
    }, [viewportWidth]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(COPILOT_PANEL_STORAGE_KEY, String(actualPanelWidth));
    }, [actualPanelWidth]);

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            const resizeState = resizeStateRef.current;
            if (!resizeState || !canResize) {
                return;
            }

            const delta = resizeState.startX - event.clientX;
            setPanelWidth(clampPanelWidth(resizeState.startWidth + delta, window.innerWidth));
        };

        const stopResize = () => {
            if (!resizeStateRef.current) {
                return;
            }

            resizeStateRef.current = null;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', stopResize);
        window.addEventListener('pointercancel', stopResize);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', stopResize);
            window.removeEventListener('pointercancel', stopResize);
            stopResize();
        };
    }, [canResize]);

    useEffect(() => {
        onReservedWidthChange?.(open ? occupiedWidth : 0);

        return () => {
            onReservedWidthChange?.(0);
        };
    }, [occupiedWidth, onReservedWidthChange, open]);

    const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!canResize) {
            return;
        }

        event.preventDefault();
        resizeStateRef.current = {
            startX: event.clientX,
            startWidth: actualPanelWidth,
        };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    };

    return {
        actualPanelWidth,
        canResize,
        handleResizeStart,
    };
};

