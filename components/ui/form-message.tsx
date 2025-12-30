type FormMessageProps = {
  type: "error" | "success";
  message?: string;
};

export function FormMessage({ type, message }: FormMessageProps) {
  if (!message) return null;

  const base = "mt-2 rounded-lg px-3 py-2 text-sm border";
  const styles =
    type === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return <div className={`${base} ${styles}`}>{message}</div>;
}
