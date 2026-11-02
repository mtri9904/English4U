import React from 'react';
import { Empty, type EmptyProps } from 'antd';

export const APP_EMPTY_IMAGE = '/images/empty_state.png';

export interface AppEmptyProps extends EmptyProps {
    imageHeight?: number | string;
}

export const AppEmpty: React.FC<AppEmptyProps> = ({
    image = APP_EMPTY_IMAGE,
    imageStyle,
    imageHeight = 88,
    style,
    ...props
}) => {
    return (
        <Empty
            image={image}
            imageStyle={{
                height: imageHeight,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                margin: '0 auto',
                ...imageStyle,
            }}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '24px 0',
                ...style,
            }}
            {...props}
        />
    );
};

export default AppEmpty;

