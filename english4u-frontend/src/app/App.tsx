import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { AntdProvider } from './providers/AntdProvider';
import { QueryProvider } from './providers/QueryProvider';
import { appRouter } from './router';
import { SessionPresenceTracker } from '@/features/auth/components/SessionPresenceTracker';

export const App = () => {
    return (
        <QueryProvider>
            <AntdProvider>
                <SessionPresenceTracker />
                <RouterProvider router={appRouter} />
            </AntdProvider>
        </QueryProvider>
    );
};
