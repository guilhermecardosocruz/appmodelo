type FormMessageProps = {
  type: "error" | "success";
  message?: string;
};

export function FormMessage({ type, message }: FormMessageProps) {
  if (!message) return null;

  const base =
    "mt-2 rounded-md px-3 py-2 text-sm border flex items-center gap-2";

  const styles =
    type === "error"
      ? "border-red-500 bg-red-500/10 text-red-200"
      : "border-emerald-500 bg-emerald-500/10 text-emerald-200";

  return <div className={`${base} ${styles}`}>{message}</div>;
}
