import { RouterProvider } from 'react-router-dom';
import { AntdProvider } from './providers/AntdProvider';
import { QueryProvider } from './providers/QueryProvider';
import { appRouter } from './router';
import { SessionPresenceTracker } from '@/features/auth/components/SessionPresenceTracker';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export const App = () => {
    return (
        <QueryProvider>
            <AntdProvider>
                <ErrorBoundary>
                    <SessionPresenceTracker />
                    <RouterProvider router={appRouter} />
                </ErrorBoundary>
            </AntdProvider>
        </QueryProvider>
    );
};
