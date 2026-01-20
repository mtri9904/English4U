import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const Button = ({
    children,
    variant = 'primary',
    size = 'md',
    className,
    ...props
}) => {
    const baseStyles = 'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

    const variants = {
        primary: 'bg-primary text-white hover:bg-primary-dark focus:ring-primary',
        secondary: 'bg-white text-primary border border-primary hover:bg-blue-50 focus:ring-primary',
        ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        outline: 'border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50'
    };

    const sizes = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg'
    };

    return (
        <button
            className={twMerge(
                clsx(baseStyles, variants[variant], sizes[size], className)
            )}
            {...props}
        >
            {children}
        </button>
    );
};

export default Button;
