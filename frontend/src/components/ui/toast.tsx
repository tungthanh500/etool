import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, XCircle, AlertTriangle } from "lucide-react";
import type { Tone } from "../../lib/labels";

interface ToastItem {
  id: number;
  tone: Tone;
  title?: string;
  message: ReactNode;
}

interface ToastInput {
  tone?: Tone;
  title?: string;
  message: ReactNode;
  duration?: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
  success: (message: ReactNode, title?: string) => void;
  error: (message: ReactNode, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<Tone, ReactNode> = {
  success: <CheckCircle2 size={18} />,
  danger: <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  orange: <AlertCircle size={18} />,
  primary: <Info size={18} />,
  neutral: <Info size={18} />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ tone = "neutral", title, message, duration = 5000 }: ToastInput) => {
      const id = ++idRef.current;
      setItems((prev) => [...prev, { id, tone, title, message }]);
      window.setTimeout(() => remove(id), duration);
    },
    [remove],
  );

  const success = useCallback(
    (message: ReactNode, title?: string) => toast({ tone: "success", message, title }),
    [toast],
  );
  const error = useCallback(
    (message: ReactNode, title?: string) => toast({ tone: "danger", message, title }),
    [toast],
  );

  return (
    <ToastContext.Provider value={{ toast, success, error }}>
      {children}
      <div className="toast-stack">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`} role="status" onClick={() => remove(t.id)}>
            <span className="toast__icon">{ICONS[t.tone]}</span>
            <div className="toast__body">
              {t.title && <div className="toast__title">{t.title}</div>}
              {t.message}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast phải dùng trong <ToastProvider>");
  return ctx;
}
