import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

// Ô chọn ngày dùng chung: bấm vào hiện lịch (Material 3 date picker) thay vì gõ số.
// Giá trị vào/ra giữ nguyên chuỗi "yyyy-MM-dd" như <input type="date"> cũ — không đổi API.
// Mọi phép tính ngày dùng Date cục bộ (năm/tháng/ngày rời) nên không dính lệch múi giờ.

interface DateInputProps {
  value: string; // "yyyy-MM-dd" hoặc ""
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Bắt buộc chọn — chặn submit form qua input ẩn (native constraint validation). */
  required?: boolean;
  /** Cho phép nút xoá nhanh giá trị. Mặc định: bật khi không required. */
  clearable?: boolean;
  "aria-label"?: string;
  /** Do <Field> tự inject để gắn <label htmlFor> đúng vào nút bấm mở lịch. */
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function parseISO(v: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatDisplay(v: string): string {
  const p = parseISO(v);
  if (!p) return "";
  return `${String(p.d).padStart(2, "0")}/${String(p.m + 1).padStart(2, "0")}/${p.y}`;
}

export function DateInput({
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  disabled,
  required,
  clearable = !required,
  "aria-label": ariaLabel,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: DateInputProps) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const today = new Date();
  const parsed = parseISO(value);
  const [viewY, setViewY] = useState(parsed?.y ?? today.getFullYear());
  const [viewM, setViewM] = useState(parsed?.m ?? today.getMonth());
  const rootRef = useRef<HTMLDivElement>(null);

  // Đóng khi bấm ra ngoài hoặc nhấn Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggleOpen() {
    if (disabled) return;
    if (!open) {
      // Mở tại tháng của giá trị hiện có (hoặc tháng này), lật lên trên nếu sát mép dưới.
      const p = parseISO(value);
      const now = new Date();
      setViewY(p?.y ?? now.getFullYear());
      setViewM(p?.m ?? now.getMonth());
      const rect = rootRef.current?.getBoundingClientRect();
      setDropUp(Boolean(rect && window.innerHeight - rect.bottom < 360 && rect.top > 360));
    }
    setOpen((o) => !o);
  }

  function shiftMonth(delta: number) {
    const next = new Date(viewY, viewM + delta, 1);
    setViewY(next.getFullYear());
    setViewM(next.getMonth());
  }

  function pick(day: number) {
    onChange(toISO(viewY, viewM, day));
    setOpen(false);
  }

  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  // Tuần bắt đầu Thứ 2: getDay() trả 0=CN nên xoay (getDay()+6)%7.
  const leadingBlanks = (new Date(viewY, viewM, 1).getDay() + 6) % 7;
  const isToday = (d: number) =>
    viewY === today.getFullYear() && viewM === today.getMonth() && d === today.getDate();
  const isSelected = (d: number) => parsed !== null && parsed.y === viewY && parsed.m === viewM && parsed.d === d;

  return (
    <div className="date-input" ref={rootRef}>
      <button
        id={id}
        type="button"
        className={`input date-input__control ${value ? "" : "date-input__control--empty"}`}
        onClick={toggleOpen}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays size={16} className="date-input__icon" />
        <span className="date-input__value">{value ? formatDisplay(value) : placeholder}</span>
      </button>
      {clearable && value && !disabled && (
        <button
          type="button"
          className="date-input__clear"
          aria-label="Xoá ngày"
          onClick={() => onChange("")}
        >
          <X size={14} />
        </button>
      )}
      {/* Input ẩn giữ constraint validation của form (required) — không tương tác được. */}
      {required && (
        <input
          className="date-input__hidden"
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => {}}
        />
      )}

      {open && (
        <div className={`date-picker ${dropUp ? "date-picker--up" : ""}`} role="dialog" aria-label="Chọn ngày">
          <div className="date-picker__header">
            <button type="button" className="date-picker__nav" aria-label="Tháng trước" onClick={() => shiftMonth(-1)}>
              <ChevronLeft size={17} />
            </button>
            <span className="date-picker__title">
              Tháng {viewM + 1}, {viewY}
            </span>
            <button type="button" className="date-picker__nav" aria-label="Tháng sau" onClick={() => shiftMonth(1)}>
              <ChevronRight size={17} />
            </button>
          </div>

          <div className="date-picker__grid">
            {WEEKDAYS.map((w) => (
              <span key={w} className="date-picker__weekday">
                {w}
              </span>
            ))}
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <span key={`b${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              return (
                <button
                  key={d}
                  type="button"
                  className={[
                    "date-picker__day",
                    isSelected(d) ? "is-selected" : "",
                    isToday(d) ? "is-today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => pick(d)}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="date-picker__footer">
            {clearable && value ? (
              <button type="button" className="date-picker__action" onClick={() => { onChange(""); setOpen(false); }}>
                Xoá
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="date-picker__action date-picker__action--primary"
              onClick={() => {
                const now = new Date();
                onChange(toISO(now.getFullYear(), now.getMonth(), now.getDate()));
                setOpen(false);
              }}
            >
              Hôm nay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
