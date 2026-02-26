import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { MainLayout } from '@/layouts/MainLayout';
import { HomePage } from '@/features/home/pages/HomePage';

export const appRouter = createBrowserRouter([
    {
        path: '/',
        element: <PublicLayout />,
        children: [
            {
                index: true,
                element: <HomePage />,
            },
        ],
    },
    {
        path: '/app',
        element: <MainLayout />,
        children: [
            // other routes
        ]
    },
    {
        path: '*',
        element: <Navigate to="/" replace />,
    }
]);
