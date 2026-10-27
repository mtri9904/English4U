import React from 'react';
import { Button, Card } from 'antd';

interface ObjectiveReviewNavigationProps {
    navigationItems: Array<{ id: string; passageNumber?: number | null; partNumber?: number | null }>;
    skillType: string;
    activeItemIndex: number;
    onChangeItem: (index: number) => void;
}

export const ObjectiveReviewNavigation: React.FC<ObjectiveReviewNavigationProps> = ({
    navigationItems,
    skillType,
    activeItemIndex,
    onChangeItem,
}) => {
    if (navigationItems.length === 0) {
        return null;
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Card
                size="small"
                styles={{ body: { padding: 0 } }}
                style={{
                    width: 'fit-content',
                    borderRadius: 0,
                    border: '1px solid #dbeafe',
                    boxShadow: '0 6px 16px rgba(15, 23, 42, 0.08)',
                    overflow: 'hidden',
                }}
            >
                <div style={{ display: 'flex' }}>
                    {navigationItems.map((item, index) => {
                        const itemNumber = skillType === 'READING'
                            ? ('passageNumber' in item ? item.passageNumber : index + 1)
                            : ('partNumber' in item ? item.partNumber : index + 1);
                        const isActive = index === activeItemIndex;

                        return (
                            <Button
                                key={item.id}
                                type="text"
                                onClick={() => onChangeItem(index)}
                                style={{
                                    borderRadius: 0,
                                    minWidth: 40,
                                    height: 34,
                                    paddingInline: 14,
                                    borderRight: index === navigationItems.length - 1 ? 'none' : '1px solid #e2e8f0',
                                    background: isActive ? '#111827' : '#fff',
                                    color: isActive ? '#fff' : '#0f172a',
                                    fontWeight: 800,
                                }}
                            >
                                {itemNumber ?? index + 1}
                            </Button>
                        );
                    })}
                </div>
            </Card>
        </div>
    );
};

