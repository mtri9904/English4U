import React from 'react';
import { Outlet } from 'react-router-dom';

export const PublicLayout: React.FC = () => {
    return (
        <div className="font-sans antialiased text-slate-900 min-h-screen selection:bg-blue-500/30">
            <main>
                <Outlet />
            </main>
        </div>
    );
};
