import React from 'react';
import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

export const MainLayout: React.FC = () => {
    return (
        <Layout className="min-h-screen">
            <Sider width={250} theme="light" className="border-r border-gray-200">
                <div className="h-16 flex items-center justify-center font-bold text-xl text-blue-600 border-b border-gray-200">
                    English4U
                </div>
            </Sider>
            <Layout>
                <Header className="bg-white px-6 flex items-center border-b border-gray-200 h-16">
                    <div className="flex-1"></div>
                </Header>
                <Content className="p-6 bg-gray-50 overflow-auto">
                    <Outlet />
                </Content>
            </Layout>
        </Layout>
    );
};
