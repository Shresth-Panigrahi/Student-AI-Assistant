import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface TypewriterProps {
    text: string;
    speed?: number;
    className?: string;
    cursorColor?: string;
}

const Typewriter = ({
    text,
    speed = 15,
    className = "",
    cursorColor = "#a855f7" // Default purple
}: TypewriterProps) => {
    const [displayedText, setDisplayedText] = useState("");
    const indexRef = useRef(0);

    // Reset if text is completely cleared (new session)
    useEffect(() => {
        if (text.length === 0) {
            setDisplayedText("");
            indexRef.current = 0;
        }
    }, [text]);

    useEffect(() => {
        // If we have text to type
        if (indexRef.current < text.length) {
            const timeoutId = setTimeout(() => {
                setDisplayedText((prev) => prev + text.charAt(indexRef.current));
                indexRef.current += 1;
            }, speed);

            return () => clearTimeout(timeoutId);
        }
    }, [text, indexRef.current, speed]); // Depend on indexRef.current to loop

    return (
        <div className={className}>
            <span className="whitespace-pre-wrap">{displayedText}</span>
            <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                style={{
                    display: 'inline-block',
                    width: '0.6em', // Width of cursor
                    height: '1.2em', // Height of text line
                    backgroundColor: cursorColor,
                    verticalAlign: 'text-bottom',
                    marginLeft: '2px'
                }}
            />
        </div>
    );
};

export default Typewriter;
