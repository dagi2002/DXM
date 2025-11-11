import React, { useCallback, useEffect, useRef } from 'react';

interface NormalisedClickEvent {
  x: number; // normalised between 0 and 1
  y: number; // normalised between 0 and 1
  weight?: number;
}

interface NormalisedScrollEvent {
  depth: number; // normalised between 0 (top) and 1 (bottom)
  weight?: number;
}

interface HeatmapCanvasProps {
  clickEvents: NormalisedClickEvent[];
  scrollEvents: NormalisedScrollEvent[];
  activeType: 'click' | 'scroll' | 'hover';
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getHeatColor = (intensity: number) => {
  const clamped = clamp(intensity, 0, 1);
  const r = 255;
  const g = Math.floor(160 + (1 - clamped) * 80);
  const b = Math.floor(0 + (1 - clamped) * 80);
  const alpha = 0.15 + clamped * 0.65;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const HeatmapCanvas: React.FC<HeatmapCanvasProps> = ({ clickEvents, scrollEvents, activeType }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const renderHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    const { width: displayWidth, height: displayHeight } = canvas.getBoundingClientRect();

    const requiredWidth = Math.floor(displayWidth * dpr);
    const requiredHeight = Math.floor(displayHeight * dpr);

    if (canvas.width !== requiredWidth || canvas.height !== requiredHeight) {
      canvas.width = requiredWidth;
      canvas.height = requiredHeight;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
    }

    context.save();
    context.scale(dpr, dpr);
    context.clearRect(0, 0, displayWidth, displayHeight);

    if (activeType === 'hover') {
      context.restore();
      return;
    }

    if (activeType === 'click') {
      const bucketSize = 60;
      const buckets = new Map<string, number>();

      clickEvents.forEach((event) => {
        const px = clamp(event.x, 0, 1) * displayWidth;
        const py = clamp(event.y, 0, 1) * displayHeight;
        const bucketX = Math.round(px / bucketSize);
        const bucketY = Math.round(py / bucketSize);
        const key = `${bucketX},${bucketY}`;
        const current = buckets.get(key) ?? 0;
        buckets.set(key, current + (event.weight ?? 1));
      });

      const intensities = Array.from(buckets.values());
      const maxIntensity = intensities.length ? Math.max(...intensities) : 1;

      buckets.forEach((count, key) => {
        const [bucketX, bucketY] = key.split(',').map(Number);
        const centerX = bucketX * bucketSize;
        const centerY = bucketY * bucketSize;
        const intensity = count / maxIntensity;
        const radius = bucketSize * 1.8;

        const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, getHeatColor(intensity));
        gradient.addColorStop(0.5, getHeatColor(intensity * 0.7));
        gradient.addColorStop(1, 'rgba(255, 99, 71, 0)');

        context.fillStyle = gradient;
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
        context.fill();
      });
    } else {
      const bucketCount = Math.max(10, Math.round(displayHeight / 50));
      const buckets = new Array(bucketCount).fill(0);

      scrollEvents.forEach((event) => {
        const depth = clamp(event.depth, 0, 1);
        const index = Math.min(bucketCount - 1, Math.floor(depth * bucketCount));
        buckets[index] += event.weight ?? 1;
      });

      const maxBucket = buckets.length ? Math.max(...buckets) : 1;

      buckets.forEach((count, index) => {
        const intensity = maxBucket === 0 ? 0 : count / maxBucket;
        const yStart = (index / bucketCount) * displayHeight;
        const yEnd = ((index + 1) / bucketCount) * displayHeight;
        const gradient = context.createLinearGradient(0, yStart, displayWidth, yEnd);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0)');
        gradient.addColorStop(0.35, getHeatColor(intensity * 0.6));
        gradient.addColorStop(0.65, getHeatColor(intensity));
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');

        context.fillStyle = gradient;
        context.fillRect(0, yStart, displayWidth, yEnd - yStart);
      });

      const overlayGradient = context.createLinearGradient(0, 0, 0, displayHeight);
      overlayGradient.addColorStop(0, 'rgba(15, 23, 42, 0.05)');
      overlayGradient.addColorStop(1, 'rgba(15, 23, 42, 0.08)');
      context.fillStyle = overlayGradient;
      context.fillRect(0, 0, displayWidth, displayHeight);
    }

    context.restore();
  }, [activeType, clickEvents, scrollEvents]);

  useEffect(() => {
    renderHeatmap();
  }, [renderHeatmap]);

  useEffect(() => {
    const handleResize = () => {
      renderHeatmap();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [renderHeatmap]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
};
