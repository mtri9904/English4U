import React from 'react';
import { Bell, Search, Menu } from 'lucide-react';
import Button from '../common/Button';

const Header = ({ onMenuClick }) => {
    return (
        <header className="h-16 bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-4">
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
                >
                    <Menu className="w-6 h-6 text-gray-600" />
                </button>
                <div className="flex items-center gap-2">
                    {/* Logo Placeholder */}
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold">E</span>
                    </div>
                    <span className="text-xl font-bold text-gray-900 hidden sm:block">EngMaster AI</span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="hidden md:flex relative">
                    <input
                        type="text"
                        placeholder="Search courses..."
                        className="w-64 pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>

                <button className="p-2 hover:bg-gray-100 rounded-full relative">
                    <Bell className="w-6 h-6 text-gray-600" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                </button>

                <div className="h-8 w-8 rounded-full bg-gray-200 overflow-hidden cursor-pointer">
                    <img
                        src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
                        alt="User Avatar"
                        className="w-full h-full object-cover"
                    />
                </div>
            </div>
        </header>
    );
};

export default Header;
