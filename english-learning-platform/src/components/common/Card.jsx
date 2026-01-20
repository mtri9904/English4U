import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const Card = ({ children, className, hoverable = false, ...props }) => {
    return (
        <div
            className={twMerge(
                clsx(
                    'bg-white rounded-xl shadow-sm border border-gray-100 p-6',
                    hoverable && 'transition-shadow hover:shadow-md cursor-pointer',
                    className
                )
            )}
            {...props}
        >
            {children}
        </div>
    );
};

export default Card;
