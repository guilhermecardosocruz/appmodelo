import { ComponentProps } from "react";

type InputProps = ComponentProps<"input"> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, className = "", ...props }: InputProps) {
  const base =
    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500";

  const errorClass = error
    ? "border-red-500 focus-visible:ring-red-500"
    : "border-slate-200";

  const classes = `${base} ${errorClass} ${className}`.trim();

  return (
    <label className="flex flex-col gap-1 text-sm">
      {label && <span className="font-medium text-slate-700">{label}</span>}
      <input className={classes} {...props} />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}
