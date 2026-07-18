import type { Tone } from "../../lib/labels";

interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  children: React.ReactNode;
}

export function Badge({ tone = "neutral", dot = true, children }: BadgeProps) {
  return (
    <span className={`badge badge--${tone}`}>
      {dot && <span className="badge__dot" aria-hidden />}
      {children}
    </span>
  );
}
