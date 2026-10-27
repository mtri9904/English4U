import React from 'react';
import { Button, Card } from 'antd';
import type {
    PracticeSessionListeningPartDto,
    PracticeSessionReadingPassageDto,
} from '../../types/session.types';

export interface ObjectiveRunnerBottomNavigationProps {
    expectedSkill: 'READING' | 'LISTENING';
    navigationItems: Array<PracticeSessionReadingPassageDto | PracticeSessionListeningPartDto>;
    activeItemIndex: number;
    onItemChange: (index: number) => void;
}

export const ObjectiveRunnerBottomNavigation: React.FC<ObjectiveRunnerBottomNavigationProps> = ({
    expectedSkill,
    navigationItems,
    activeItemIndex,
    onItemChange,
}) => {
    return (
        <div
            style={{
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 900,
                padding: '4px 8px 6px',
                background: 'linear-gradient(180deg, rgba(248,250,252,0) 0%, rgba(248,250,252,0.74) 55%, rgba(248,250,252,0.9) 100%)',
                pointerEvents: 'none',
            }}
        >
            <div style={{ width: 'fit-content', margin: '0 auto', pointerEvents: 'auto' }}>
                <Card
                    size="small"
                    styles={{ body: { padding: 0 } }}
                    style={{
                        width: 'fit-content',
                        margin: '0 auto',
                        borderRadius: 0,
                        border: '1px solid #dbeafe',
                        boxShadow: '0 6px 16px rgba(15, 23, 42, 0.1)',
                        background: 'rgba(255, 255, 255, 0.96)',
                        backdropFilter: 'blur(10px)',
                        overflow: 'hidden',
                    }}
                >
                    <div style={{ display: 'flex' }}>
                        {navigationItems.map((item, index) => {
                            const itemNumber = expectedSkill === 'READING'
                                ? (item as PracticeSessionReadingPassageDto).passageNumber
                                : (item as PracticeSessionListeningPartDto).partNumber;
                            const isActive = index === activeItemIndex;

                            return (
                                <Button
                                    key={item.id}
                                    type="text"
                                    aria-label={`${expectedSkill === 'READING' ? 'Passage' : 'Part'} ${itemNumber ?? index + 1}`}
                                    onClick={() => onItemChange(index)}
                                    style={{
                                        borderRadius: 0,
                                        minWidth: 38,
                                        height: 32,
                                        paddingInline: 12,
                                        borderRight: index === navigationItems.length - 1 ? 'none' : '1px solid #e2e8f0',
                                        background: isActive ? '#111827' : '#fff',
                                        color: isActive ? '#fff' : '#0f172a',
                                        fontWeight: 700,
                                    }}
                                >
                                    {itemNumber ?? index + 1}
                                </Button>
                            );
                        })}
                    </div>
                </Card>
            </div>
        </div>
    );
};

