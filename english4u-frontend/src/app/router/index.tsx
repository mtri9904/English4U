import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { ClientLayout } from '@/layouts/ClientLayout';
import { HomePage } from '@/features/home/pages/HomePage';
import { AboutPage } from '@/features/home/pages/AboutPage';
import { ContactPage } from '@/features/home/pages/ContactPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { AdminLoginPage, AdminDashboard, ExamManagement, ExamDetailPage, ExamEditorPage, ProfilePage } from '@/features/admin';
import { AdminLayout } from '@/layouts/AdminLayout';
import { ClientDashboard } from '@/features/client';


export const appRouter = createBrowserRouter([
    {
        path: '/',
        element: <PublicLayout />,
        children: [
            {
                index: true,
                element: <HomePage />,
            },
            {
                path: 'about',
                element: <AboutPage />,
            },
            {
                path: 'contact',
                element: <ContactPage />,
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
        path: '/admin/login',
        element: <AdminLoginPage />,
    },
    {
        path: '/admin',
        element: <AdminLayout />,
        children: [
            {
                index: true,
                element: <Navigate to="dashboard" replace />,
            },
            {
                path: 'dashboard',
                element: <AdminDashboard />,
            },
            {
                path: 'exams',
                element: <ExamManagement />,
            },
            {
                path: 'exams/:id',
                element: <ExamDetailPage />,
            },
            {
                path: 'exams/create',
                element: <ExamEditorPage />,
            },
            {
                path: 'exams/edit/:id',
                element: <ExamEditorPage />,
            },
            {
                path: 'profile',
                element: <ProfilePage />,
            },
        ]
    },
    {
        path: '/app',
        element: <ClientLayout />,
        children: [
            {
                index: true,
                element: <ClientDashboard />,
            },
        ]
    },
    {
        path: '*',
        element: <Navigate to="/" replace />,
    }
]);
