interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string;
  className?: string;
}

export function Skeleton({ width = "100%", height = 14, radius, className }: SkeletonProps) {
  return (
    <span
      className={["skeleton", className ?? ""].filter(Boolean).join(" ")}
      style={{ display: "block", width, height, borderRadius: radius }}
      aria-hidden
    />
  );
}

// Nhiều dòng skeleton cho thân bảng đang tải.
export function SkeletonRows({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)", padding: "var(--sp-4)" }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "flex", gap: "var(--sp-4)" }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height={16} width={c === 0 ? "40%" : "20%"} />
          ))}
        </div>
      ))}
    </div>
  );
}
