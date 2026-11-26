import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export type PageTitleBack = {
  to: string;
  label: string;
  state?: unknown;
  disabled?: boolean;
};

export function PageTitle({ title, back }: { title: string; back?: PageTitleBack }) {
  if (!back) return <h1>{title}</h1>;

  return (
    <div className="page-title-with-back">
      <Link
        to={back.to}
        state={back.state}
        className="page-title-back"
        aria-label={back.label}
        title={back.label}
        aria-disabled={back.disabled || undefined}
        tabIndex={back.disabled ? -1 : undefined}
        onClick={(event) => {
          if (back.disabled) event.preventDefault();
        }}
      >
        <ArrowLeft size={23} strokeWidth={3} aria-hidden="true" />
      </Link>
      <h1>{title}</h1>
    </div>
  );
}
