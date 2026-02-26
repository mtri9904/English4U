import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { MainLayout } from '@/layouts/MainLayout';
import { HomePage } from '@/features/home/pages/HomePage';
import { LoginPage } from '@/features/auth/pages/LoginPage';

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
        path: '/login',
        element: <LoginPage mode="login" />,
    },
    {
        path: '/register',
        element: <LoginPage mode="register" />,
    },
    {
        path: '/forgot-password',
        element: <LoginPage mode="forgot" />,
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
