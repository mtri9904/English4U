import React from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';

export const ScrollProgressBar: React.FC = () => {
    const { scrollYProgress } = useScroll();

    // useSpring adds a smooth, elastic physics-based animation as the user scrolls
    const scaleX = useSpring(scrollYProgress, {
        stiffness: 120,
        damping: 30,
        restDelta: 0.001,
    });

    return (
        <motion.div
            aria-hidden="true"
            style={{
                scaleX,
                transformOrigin: '0%',
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: 'linear-gradient(90deg, #facc15, #eab308, #f59e0b)',
                boxShadow: '0 0 10px rgba(234, 179, 8, 0.7), 0 0 4px rgba(250, 204, 21, 0.9)',
                zIndex: 99999,
                pointerEvents: 'none',
            }}
        />
    );
};
