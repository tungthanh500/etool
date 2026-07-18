interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
}

// Palette cố định — màu sinh theo hash tên để mỗi người một màu ổn định.
const COLORS = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#16a34a",
  "#0891b2",
  "#c026d3",
  "#4f46e5",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[parts.length - 1][0]).slice(0, 2);
}

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function Avatar({ name, size = "md" }: AvatarProps) {
  return (
    <span
      className={`avatar avatar--${size}`}
      style={{ background: colorFor(name) }}
      title={name}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
