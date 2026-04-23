import type { FC } from 'react';
import { Button, Card, Result, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

const { Paragraph } = Typography;

interface ClientPlaceholderPageProps {
    title: string;
    description: string;
}

export const ClientPlaceholderPage: FC<ClientPlaceholderPageProps> = ({
    title,
    description,
}) => {
    const navigate = useNavigate();

    return (
        <Card style={{ borderRadius: 20 }}>
            <Result
                status="info"
                title={title}
                subTitle={description}
                extra={[
                    <Button key="practice" type="primary" onClick={() => navigate('/app/practice')}>
                        Xem danh sách đề thi
                    </Button>,
                ]}
            >
                <Paragraph style={{ maxWidth: 560, margin: '0 auto', color: '#64748b' }}>
                    Bạn có thể quay lại kho đề để tiếp tục chọn bài thi phù hợp trong lúc màn này được hoàn thiện.
                </Paragraph>
            </Result>
        </Card>
    );
};
