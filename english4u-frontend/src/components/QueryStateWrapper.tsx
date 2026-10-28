import React from 'react';
import { PageLoadingState, type PageLoadingStateProps } from './PageLoadingState';
import { PageErrorState, type PageErrorStateProps } from './PageErrorState';

export interface QueryStateWrapperProps {
    isLoading?: boolean;
    isError?: boolean;
    error?: unknown;
    onRetry?: () => void;
    // Loading customization
    loadingType?: PageLoadingStateProps['type'];
    loadingTip?: string;
    loadingRows?: number;
    loadingCardCount?: number;
    loadingStyle?: React.CSSProperties;
    // Error customization
    errorTitle?: string;
    errorSubTitle?: string;
    errorStatus?: PageErrorStateProps['status'];
    backUrl?: string;
    backText?: string;
    onBack?: () => void;
    errorStyle?: React.CSSProperties;
    // Children
    children: React.ReactNode;
}

export const QueryStateWrapper: React.FC<QueryStateWrapperProps> = ({
    isLoading,
    isError,
    error,
    onRetry,
    loadingType = 'skeleton',
    loadingTip,
    loadingRows,
    loadingCardCount,
    loadingStyle,
    errorTitle,
    errorSubTitle,
    errorStatus = 'warning',
    backUrl,
    backText,
    onBack,
    errorStyle,
    children,
}) => {
    if (isLoading) {
        return (
            <PageLoadingState
                type={loadingType}
                tip={loadingTip}
                rows={loadingRows}
                cardCount={loadingCardCount}
                style={loadingStyle}
            />
        );
    }

    if (isError) {
        return (
            <PageErrorState
                title={errorTitle}
                subTitle={errorSubTitle}
                status={errorStatus}
                error={error}
                onRetry={onRetry}
                backUrl={backUrl}
                backText={backText}
                onBack={onBack}
                style={errorStyle}
            />
        );
    }

    return <>{children}</>;
};

