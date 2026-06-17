import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { ClientLayout } from '@/layouts/ClientLayout';
import { HomePage } from '@/features/home/pages/HomePage';
import { AboutPage } from '@/features/home/pages/AboutPage';
import { ContactPage } from '@/features/home/pages/ContactPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import ResetPasswordPage from '@/features/auth/pages/ResetPasswordPage';
import { ConfirmEmailPage } from '@/features/auth/pages/ConfirmEmailPage';
import {
    AdminLoginPage,
    AdminDashboard,
    StudentManagementPage,
    ExamManagement,
    ExamDetailPage,
    ExamEditorPage,
    AdminExamAiGenerationPage,
    AttemptManagementPage,
    ProfilePage,
    NotificationManagementPage,
    AdminNotFoundPage,
    GamificationPage,
} from '@/features/admin';
import { AdminLayout } from '@/layouts/AdminLayout';
import {
    ClientDashboard,
    ClientNotFoundPage,
    ClientMyExamsPage,
    ClientPracticeExamPage,
    ClientPracticePage,
    ClientReadingSessionPage,
    ClientProfilePage,
    ClientListeningSessionPage,
    ClientWritingSessionPage,
    ClientSpeakingSessionPage,
    ClientSessionSubmitPage,
    ClientProgressPage,
} from '@/features/client';


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
        path: '/reset-password',
        element: <ResetPasswordPage />,
    },
    {
        path: '/confirm-email',
        element: <ConfirmEmailPage />,
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
                path: 'users',
                element: <StudentManagementPage />,
            },
            {
                path: 'exams',
                element: <ExamManagement />,
            },
            {
                path: 'attempts',
                element: <AttemptManagementPage />,
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
                path: 'exams/generate-ai',
                element: <AdminExamAiGenerationPage />,
            },
            {
                path: 'exams/edit/:id',
                element: <ExamEditorPage />,
            },
            {
                path: 'gamification',
                element: <GamificationPage />,
            },
            {
                path: 'profile',
                element: <ProfilePage />,
            },
            {
                path: 'notifications',
                element: <NotificationManagementPage />,
            },
            {
                path: '*',
                element: <AdminNotFoundPage />,
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
            {
                path: 'practice',
                element: <ClientPracticePage />,
            },
            {
                path: 'practice/:examId',
                element: <ClientPracticeExamPage />,
            },
            {
                path: 'my-exams',
                element: <ClientMyExamsPage />,
            },
            {
                path: 'sessions/:sessionId/reading',
                element: <ClientReadingSessionPage />,
            },
            {
                path: 'sessions/:sessionId/listening',
                element: <ClientListeningSessionPage />,
            },
            {
                path: 'sessions/:sessionId/writing',
                element: <ClientWritingSessionPage />,
            },
            {
                path: 'sessions/:sessionId/speaking',
                element: <ClientSpeakingSessionPage />,
            },
            {
                path: 'sessions/:sessionId/submit',
                element: <ClientSessionSubmitPage />,
            },
            {
                path: 'progress',
                element: <ClientProgressPage />,
            },
            {
                path: 'profile',
                element: <ClientProfilePage />,
            },
        ]
    },
    {
        path: '*',
        element: <ClientNotFoundPage />,
    }
]);
