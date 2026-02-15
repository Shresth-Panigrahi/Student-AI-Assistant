import { useEffect, useState, useRef } from 'react';

interface TypewriterTextProps {
    text: string;
    speed?: number;
    onUpdate?: () => void;
}

export default function TypewriterText({ text, speed = 25, onUpdate }: TypewriterTextProps) {
    const [displayedText, setDisplayedText] = useState(text);
    const targetTextRef = useRef(text);

    // Sync ref with prop
    useEffect(() => {
        targetTextRef.current = text;
    }, [text]);

    // Handle typing effect
    useEffect(() => {
        const timer = setInterval(() => {
            setDisplayedText((current) => {
                // If current text matches target, do nothing
                if (current === targetTextRef.current) {
                    return current;
                }

                // If target was cleared or drastically shorter, reset immediately
                if (targetTextRef.current.length < current.length) {
                    return targetTextRef.current;
                }

                // If we are too far behind (e.g. initial load), jumping ahead a bit can help
                // But for "typing format" we generally want to type it out.
                // Let's type one character
                const nextChar = targetTextRef.current.charAt(current.length);
                return current + nextChar;
            });
        }, speed);

        return () => clearInterval(timer);
    }, [speed]);

    // Notify parent of updates (for auto-scrolling)
    useEffect(() => {
        if (onUpdate) {
            onUpdate();
        }
    }, [displayedText, onUpdate]);

    return (
        <div className="whitespace-pre-wrap font-mono text-base leading-relaxed text-gray-200">
            {displayedText}
            {displayedText.length < text.length && (
                <span className="inline-block w-2 h-4 ml-1 align-middle bg-royal-purple animate-pulse" />
            )}
        </div>
    );
}
