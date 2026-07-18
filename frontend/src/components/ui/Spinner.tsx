interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 18, className }: SpinnerProps) {
  return (
    <span
      className={["spinner", className ?? ""].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Đang tải"
    />
  );
}

export function PageLoading({ label = "Đang tải..." }: { label?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--sp-3)",
        padding: "var(--sp-16)",
        color: "var(--text-muted)",
      }}
    >
      <Spinner size={28} />
      <span>{label}</span>
    </div>
  );
}
