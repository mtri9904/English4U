import React from 'react';
import { Card } from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    EditOutlined,
    FileTextOutlined,
} from '@ant-design/icons';

export interface ExamOverviewData {
    total: number;
    published: number;
    draft: number;
    avgDuration: number;
}

interface ExamOverviewStatsProps {
    overview: ExamOverviewData;
}

export const ExamOverviewStats: React.FC<ExamOverviewStatsProps> = ({ overview }) => {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: 12,
            }}
        >
            <Card style={{ borderRadius: 14, border: '1px solid #dbeafe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Tổng đề thi</div>
                        <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '1.55rem' }}>
                            {overview.total}
                        </div>
                    </div>
                    <FileTextOutlined style={{ color: '#2563eb', fontSize: 20 }} />
                </div>
            </Card>
            <Card style={{ borderRadius: 14, border: '1px solid #dcfce7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Đang xuất bản</div>
                        <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '1.55rem' }}>
                            {overview.published}
                        </div>
                    </div>
                    <CheckCircleOutlined style={{ color: '#16a34a', fontSize: 20 }} />
                </div>
            </Card>
            <Card style={{ borderRadius: 14, border: '1px solid #fee2e2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Đề nháp</div>
                        <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '1.55rem' }}>
                            {overview.draft}
                        </div>
                    </div>
                    <EditOutlined style={{ color: '#dc2626', fontSize: 20 }} />
                </div>
            </Card>
            <Card style={{ borderRadius: 14, border: '1px solid #ede9fe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Thời gian TB</div>
                        <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '1.55rem' }}>
                            {overview.avgDuration} phút
                        </div>
                    </div>
                    <ClockCircleOutlined style={{ color: '#7c3aed', fontSize: 20 }} />
                </div>
            </Card>
        </div>
    );
};

