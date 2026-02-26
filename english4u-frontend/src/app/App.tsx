import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { AntdProvider } from './providers/AntdProvider';
import { QueryProvider } from './providers/QueryProvider';
import { appRouter } from './router';

export const App = () => {
    return (
        <QueryProvider>
            <AntdProvider>
                <RouterProvider router={appRouter} />
            </AntdProvider>
        </QueryProvider>
    );
};
