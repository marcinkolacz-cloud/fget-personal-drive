import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface ZoomPanViewerProps {
  children: ReactNode;
  className?: string;
}

export function ZoomPanViewer({
  children,
  className = "",
}: ZoomPanViewerProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();

    const delta = e.deltaY * -0.001;
    setScale((prev) => Math.min(Math.max(0.5, prev + delta), 5));
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start dragging on left mouse button
    if (e.button !== 0) return;

    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  // Reset zoom and pan when children change
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: isDragging ? "grabbing" : "grab" }}
    >
      <div
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: isDragging ? "none" : "transform 0.1s ease-out",
        }}
        className="w-full h-full flex items-center justify-center"
      >
        {children}
      </div>
    </div>
  );
}
