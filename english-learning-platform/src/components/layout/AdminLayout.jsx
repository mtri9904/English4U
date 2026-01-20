import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Users, BookOpen, FileText, LayoutDashboard, LogOut } from 'lucide-react';
import useAuthStore from '../../store/authStore';

const AdminLayout = () => {
    const location = useLocation();
    const { user, logout } = useAuthStore();

    const navigation = [
        { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
        { name: 'Users', href: '/admin/users', icon: Users },
        { name: 'Courses', href: '/admin/courses', icon: BookOpen },
        { name: 'Submissions', href: '/admin/submissions', icon: FileText },
    ];

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Sidebar */}
            <div className="fixed inset-y-0 left-0 w-64 bg-gray-900">
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="flex items-center justify-center h-16 bg-gray-800">
                        <h1 className="text-xl font-bold text-white">Admin Panel</h1>
                    </div>

                    {/* User info */}
                    <div className="px-4 py-4 bg-gray-800">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                                {user?.FullName?.charAt(0) || 'A'}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">{user?.FullName}</p>
                                <p className="text-xs text-gray-400">{user?.Role}</p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 px-4 py-6 space-y-2">
                        {navigation.map((item) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.href;
                            return (
                                <Link
                                    key={item.name}
                                    to={item.href}
                                    className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${isActive
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                                        }`}
                                >
                                    <Icon className="w-5 h-5 mr-3" />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Logout */}
                    <div className="p-4 border-t border-gray-800">
                        <button
                            onClick={logout}
                            className="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-300 rounded-lg hover:bg-gray-800 hover:text-white transition-colors"
                        >
                            <LogOut className="w-5 h-5 mr-3" />
                            Logout
                        </button>
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="ml-64">
                <div className="p-8">
                    <Outlet />
                </div>
            </div>
        </div>
    );
};

export default AdminLayout;
