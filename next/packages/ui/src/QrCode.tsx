import { useMemo } from 'react';
import { encode } from 'uqr';

/**
 * QR code as crisp inline SVG. Always dark modules on a light tile, even in dark mode: many
 * authenticator scanners can't read inverted codes. The SVG is decorative to assistive tech;
 * callers must show the same value as text (e.g. the manual setup key) next to it.
 */
export function QrCode({
  value,
  size = 184,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const path = useMemo(() => {
    const { data } = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { d, n: data.length };
  }, [value]);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${path.n} ${path.n}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      data-testid="qr-code"
      className={['rounded-md bg-white text-black', className].filter(Boolean).join(' ')}
    >
      <path d={path.d} fill="currentColor" />
    </svg>
  );
}
