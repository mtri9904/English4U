import React from 'react';
import { Button, type ButtonProps } from 'antd';

export interface AppButtonProps extends ButtonProps {
    variantType?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline';
}

/**
 * AppButton - Standardized button wrapper
 * Follows the enterprise pattern from Mebifarm CMS (web)
 */
export const AppButton: React.FC<AppButtonProps> = ({
    variantType = 'primary',
    style,
    children,
    ...props
}) => {
    let customStyle: React.CSSProperties = {
        borderRadius: 10,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        transition: 'all 0.2s ease',
        ...style,
    };

    if (variantType === 'success') {
        customStyle = {
            ...customStyle,
            backgroundColor: '#16a34a',
            borderColor: '#16a34a',
            color: '#fff',
        };
    } else if (variantType === 'secondary') {
        customStyle = {
            ...customStyle,
            backgroundColor: '#f1f5f9',
            borderColor: '#e2e8f0',
            color: '#334155',
        };
    }

    return (
        <Button
            type={variantType === 'danger' ? 'primary' : variantType === 'outline' ? 'default' : props.type || 'primary'}
            danger={variantType === 'danger'}
            style={customStyle}
            {...props}
        >
            {children}
        </Button>
    );
};

export default AppButton;

