import { ComponentProps } from "react";

type InputProps = ComponentProps<"input"> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, className = "", ...props }: InputProps) {
  const base =
    "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

  const errorClass = error ? "border-red-500 focus-visible:ring-red-500" : "";

  const classes = `${base} ${errorClass} ${className}`.trim();

  return (
    <label className="flex flex-col gap-1 text-sm">
      {label && <span className="font-medium text-slate-200">{label}</span>}
      <input className={classes} {...props} />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
}
