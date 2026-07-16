import { useEffect, useRef } from 'react';

// A glowing ring that smoothly follows the mouse.
// Only shows on devices with a real mouse (not touch/mobile).
export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const position = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Skip on touch devices (phones/tablets don't have a mouse cursor)
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
    if (!hasFinePointer) return;

    const handleMouseMove = (e: MouseEvent) => {
      target.current.x = e.clientX;
      target.current.y = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    let frameId: number;
    const animate = () => {
      // "Lerp" (linear interpolation) creates the smooth lag/trailing feel
      position.current.x += (target.current.x - position.current.x) * 0.15;
      position.current.y += (target.current.y - position.current.y) * 0.15;

      if (dotRef.current) {
        dotRef.current.style.transform =
          `translate(${position.current.x}px, ${position.current.y}px)`;
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(frameId);
    };
  }, []);

  return <div ref={dotRef} id="custom-cursor" />;
}