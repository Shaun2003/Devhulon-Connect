import type { ReactNode } from "react";

export function RequiredFieldsLegend() {
  return (
    <p className="text-xs font-medium text-[#1d3a5f]/65">
      <span className="font-black text-red-600" aria-hidden="true">*</span>
      <span className="sr-only">Asterisk: </span> Required field
    </p>
  );
}

export function RequiredMark() {
  return <span className="font-black text-red-600" aria-hidden="true">*</span>;
}

export function OptionalMark() {
  return <span className="font-medium text-[#1d3a5f]/55">(Optional)</span>;
}

export function FieldLabel({
  label,
  required = false,
  children,
  hint,
  error,
  className = "block text-sm font-bold text-[#10243e]",
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  hint?: string;
  error?: string;
  className?: string;
}) {
  const errorId = error ? `field-error-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined;
  return (
    <label className={className}>
      <span>
        {label}{" "}
        {required ? <RequiredMark /> : <OptionalMark />}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-[#1d3a5f]/60">{hint}</span>}
      {error && <span id={errorId} className="mt-1 block text-xs font-semibold text-red-700" role="alert">{error}</span>}
    </label>
  );
}
