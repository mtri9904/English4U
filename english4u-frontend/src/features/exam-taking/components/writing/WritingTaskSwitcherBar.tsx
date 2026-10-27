import React from 'react';
import { Button, Card } from 'antd';
import type { PracticeSessionWritingTaskDto } from '../../types/session.types';

interface WritingTaskSwitcherBarProps {
    writingTasks: PracticeSessionWritingTaskDto[];
    activeTaskIndex: number;
    onTaskChange: (index: number) => void;
}

export const WritingTaskSwitcherBar: React.FC<WritingTaskSwitcherBarProps> = ({
    writingTasks,
    activeTaskIndex,
    onTaskChange,
}) => {
    if (writingTasks.length <= 1) return null;

    return (
        <div
            style={{
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 900,
                padding: '4px 8px 6px',
                background:
                    'linear-gradient(180deg, rgba(248,250,252,0) 0%, rgba(248,250,252,0.74) 55%, rgba(248,250,252,0.9) 100%)',
                pointerEvents: 'none',
            }}
        >
            <div style={{ width: 'fit-content', margin: '0 auto', pointerEvents: 'auto' }}>
                <Card
                    size="small"
                    bodyStyle={{ padding: 0 }}
                    style={{
                        width: 'fit-content',
                        margin: '0 auto',
                        borderRadius: 0,
                        border: '1px solid #fed7aa',
                        boxShadow: '0 6px 16px rgba(15, 23, 42, 0.1)',
                        background: 'rgba(255, 255, 255, 0.96)',
                        backdropFilter: 'blur(10px)',
                        overflow: 'hidden',
                    }}
                >
                    <div style={{ display: 'flex' }}>
                        {writingTasks.map((task, index) => {
                            const taskNumber = task.taskNumber ?? index + 1;
                            const isActive = index === activeTaskIndex;

                            return (
                                <Button
                                    key={task.id}
                                    type="text"
                                    aria-label={`Writing Task ${taskNumber}`}
                                    onClick={() => onTaskChange(index)}
                                    style={{
                                        borderRadius: 0,
                                        minWidth: 38,
                                        height: 32,
                                        paddingInline: 12,
                                        borderRight:
                                            index === writingTasks.length - 1 ? 'none' : '1px solid #e2e8f0',
                                        background: isActive ? '#111827' : '#fff',
                                        color: isActive ? '#fff' : '#0f172a',
                                        fontWeight: 700,
                                    }}
                                >
                                    {taskNumber}
                                </Button>
                            );
                        })}
                    </div>
                </Card>
            </div>
        </div>
    );
};

