import { createBrowserRouter, Navigate } from 'react-router-dom'
import { HomePage } from '@/features/home'
import { DashboardPage } from '@/features/dashboard'
import { DesignSystemPage } from '@/features/design-system'

export const router = createBrowserRouter([
    {
        path: '/',
        element: <HomePage />,
    },
    {
        path: '/dashboard',
        element: <DashboardPage />,
    },
    {
        path: '/design-system',
        element: <DesignSystemPage />,
    },
    {
        path: '*',
        element: <Navigate to="/" replace />
    }
])
