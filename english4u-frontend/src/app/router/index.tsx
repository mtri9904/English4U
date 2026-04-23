import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { ClientLayout } from '@/layouts/ClientLayout';
import { HomePage } from '@/features/home/pages/HomePage';
import { AboutPage } from '@/features/home/pages/AboutPage';
import { ContactPage } from '@/features/home/pages/ContactPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import ResetPasswordPage from '@/features/auth/pages/ResetPasswordPage';
import {
    AdminLoginPage,
    AdminDashboard,
    StudentManagementPage,
    ExamManagement,
    PdfRawPreviewPage,
    ExamDetailPage,
    ExamEditorPage,
    AttemptManagementPage,
    ProfilePage,
    NotificationManagementPage,
    BillingManagementPage,
    AdminNotFoundPage,
} from '@/features/admin';
import { AdminLayout } from '@/layouts/AdminLayout';
import {
    ClientDashboard,
    ClientNotFoundPage,
    ClientPlaceholderPage,
    ClientMyExamsPage,
    ClientPracticeExamPage,
    ClientPracticePage,
    ClientReadingSessionPage,
    ClientListeningSessionPage,
    ClientWritingSessionPage,
    ClientSessionSubmitPage,
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
                path: 'exams/raw-preview',
                element: <PdfRawPreviewPage />,
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
                path: 'billing',
                element: <BillingManagementPage />,
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
                path: 'sessions/:sessionId/submit',
                element: <ClientSessionSubmitPage />,
            },
            {
                path: 'progress',
                element: (
                    <ClientPlaceholderPage
                        title="Tiến trình"
                        description="Biểu đồ band, tỷ lệ đúng và mức tiến bộ theo kỹ năng sẽ hiển thị ở đây."
                    />
                ),
            },
            {
                path: 'profile',
                element: (
                    <ClientPlaceholderPage
                        title="Hồ sơ"
                        description="Thông tin tài khoản và dữ liệu cá nhân của bạn sẽ được quản lý tại đây."
                    />
                ),
            },
            {
                path: 'settings',
                element: (
                    <ClientPlaceholderPage
                        title="Cài đặt"
                        description="Các thiết lập liên quan đến timer, audio và thông báo sẽ nằm trong màn này."
                    />
                ),
            },
        ]
    },
    {
        path: '*',
        element: <ClientNotFoundPage />,
    }
]);
