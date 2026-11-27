import { useMemo } from "react";
import { checkPasswordRules } from "../utils/passwordRules";

export default function PasswordChecklist({ password = "" }) {
  const status = useMemo(() => checkPasswordRules(password), [password]);
  const started = password.length > 0;

  const rules = [
    { key: "minLength", label: "At least 8 characters", met: status.minLength },
    { key: "hasUppercase", label: "At least 1 uppercase letter (A-Z)", met: status.hasUppercase },
    { key: "hasSpecial", label: "At least 1 special character (!@#$%^&*)", met: status.hasSpecial },
  ];

  const barColor =
    status.passedCount === 3
      ? "bg-emerald-500"
      : status.passedCount === 2
      ? "bg-amber-500"
      : "bg-rose-500";

  return (
    <div className="mt-2 rounded-xl border border-line bg-paper/70 p-2.5 space-y-2" aria-live="polite">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-muted">Password requirements</span>
        <span
          className={`font-bold ${
            !started
              ? "text-muted"
              : status.isValid
              ? "text-emerald-700"
              : status.passedCount === 2
              ? "text-amber-700"
              : "text-rose-600"
          }`}
        >
          {!started
            ? "0 / 3"
            : status.isValid
            ? "Strong (3 / 3)"
            : `${status.passedCount} / 3 met`}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={`h-1.5 rounded-full transition-colors duration-200 ${
              status.passedCount >= step ? barColor : "bg-line"
            }`}
          />
        ))}
      </div>

      <ul className="space-y-1 text-[11px]">
        {rules.map((r) => (
          <li
            key={r.key}
            className={`flex items-center gap-1.5 transition-colors ${
              r.met
                ? "text-emerald-700 font-semibold"
                : started
                ? "text-rose-600"
                : "text-muted"
            }`}
          >
            <span className="inline-flex w-3.5 justify-center font-bold">
              {r.met ? "✓" : started ? "✕" : "○"}
            </span>
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
