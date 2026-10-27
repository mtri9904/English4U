import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { ClientLayout } from '@/layouts/ClientLayout';
import { HomePage } from '@/features/home/pages/HomePage';
import { AboutPage } from '@/features/home/pages/AboutPage';
import { ContactPage } from '@/features/home/pages/ContactPage';
import { PrivacyPolicyPage } from '@/features/home/pages/PrivacyPolicyPage';
import { TermsOfServicePage } from '@/features/home/pages/TermsOfServicePage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import ResetPasswordPage from '@/features/auth/pages/ResetPasswordPage';
import { ConfirmEmailPage } from '@/features/auth/pages/ConfirmEmailPage';
import {
    AdminLoginPage,
    AdminDashboard,
    AdminNotFoundPage,
} from '@/features/admin';
import { StudentManagementPage, ProfilePage, ClientProfilePage } from '@/features/students';
import { AttemptManagementPage } from '@/features/attempts';
import { NotificationManagementPage } from '@/features/notifications';
import { ProgressPage } from '@/features/gamification';
import {
    ExamManagementPage,
    ExamDetailPage,
    ExamEditorPage,
    ExamAiGenerationPage,
    PracticeCatalogPage,
    PracticeExamDetailPage,
    MyExamsPage,
} from '@/features/exams';
import { AdminLayout } from '@/layouts/AdminLayout';
import {
    ClientDashboard,
    ClientNotFoundPage,
} from '@/features/client';
import {
    ReadingSessionPage,
    ListeningSessionPage,
    WritingSessionPage,
    SpeakingSessionPage,
    SessionSubmitPage,
} from '@/features/exam-taking';
import {
    FlashcardDeckListPage,
    FlashcardDeckDetailPage,
    FlashcardStudyPage,
} from '@/features/flashcard';
import { ROUTE_PATHS } from '@/constants/route-paths';
import { RequirePolicy } from '@/components/RequirePolicy';


export const appRouter = createBrowserRouter([
    {
        path: ROUTE_PATHS.HOME,
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
            {
                path: 'privacy-policy',
                element: <PrivacyPolicyPage />,
            },
            {
                path: 'privacy',
                element: <PrivacyPolicyPage />,
            },
            {
                path: 'terms-of-service',
                element: <TermsOfServicePage />,
            },
            {
                path: 'terms',
                element: <TermsOfServicePage />,
            },
        ],
    },
    {
        path: ROUTE_PATHS.LOGIN,
        element: <LoginPage mode="login" />,
    },
    {
        path: ROUTE_PATHS.REGISTER,
        element: <LoginPage mode="register" />,
    },
    {
        path: ROUTE_PATHS.FORGOT_PASSWORD,
        element: <LoginPage mode="forgot" />,
    },
    {
        path: ROUTE_PATHS.RESET_PASSWORD,
        element: <ResetPasswordPage />,
    },
    {
        path: ROUTE_PATHS.CONFIRM_EMAIL,
        element: <ConfirmEmailPage />,
    },
    {
        path: ROUTE_PATHS.ADMIN_LOGIN,
        element: <AdminLoginPage />,
    },
    {
        path: ROUTE_PATHS.ADMIN_ROOT,
        element: (
            <RequirePolicy requiredRole="Admin">
                <AdminLayout />
            </RequirePolicy>
        ),
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
                element: <ExamManagementPage />,
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
                element: <ExamAiGenerationPage />,
            },
            {
                path: 'exams/edit/:id',
                element: <ExamEditorPage />,
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
        path: ROUTE_PATHS.APP_ROOT,
        element: (
            <RequirePolicy>
                <ClientLayout />
            </RequirePolicy>
        ),
        children: [
            {
                index: true,
                element: <ClientDashboard />,
            },
            {
                path: 'practice',
                element: <PracticeCatalogPage />,
            },
            {
                path: 'practice/:examId',
                element: <PracticeExamDetailPage />,
            },
            {
                path: 'my-exams',
                element: <MyExamsPage />,
            },
            {
                path: 'sessions/:sessionId/reading',
                element: <ReadingSessionPage />,
            },
            {
                path: 'sessions/:sessionId/listening',
                element: <ListeningSessionPage />,
            },
            {
                path: 'sessions/:sessionId/writing',
                element: <WritingSessionPage />,
            },
            {
                path: 'sessions/:sessionId/speaking',
                element: <SpeakingSessionPage />,
            },
            {
                path: 'sessions/:sessionId/submit',
                element: <SessionSubmitPage />,
            },
            {
                path: 'progress',
                element: <ProgressPage />,
            },
            {
                path: 'flashcards',
                element: <FlashcardDeckListPage />,
            },
            {
                path: 'flashcards/:deckId',
                element: <FlashcardDeckDetailPage />,
            },
            {
                path: 'flashcards/:deckId/study',
                element: <FlashcardStudyPage />,
            },
            {
                path: 'profile',
                element: <ClientProfilePage />,
            },
        ]
    },
    {
        path: ROUTE_PATHS.FLASHCARDS_ROOT,
        element: <ClientLayout />,
        children: [
            {
                index: true,
                element: <FlashcardDeckListPage />,
            },
            {
                path: ':deckId',
                element: <FlashcardDeckDetailPage />,
            },
            {
                path: ':deckId/study',
                element: <FlashcardStudyPage />,
            },
        ]
    },
    {
        path: '*',
        element: <ClientNotFoundPage />,
    }
]);
