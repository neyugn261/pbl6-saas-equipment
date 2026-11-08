import { useEffect, useRef, useState, type SetStateAction } from "react";
import { useSession } from "../../auth/session";
import { clearDraft, draftKey, loadDraft, storeDraft } from "./ui-draft";

/** Same-tab drafts are isolated by tenant, customer, user and resource. */
export function useFormDraft<T extends object>(form: string, initial: T) {
  const { profile } = useSession();
  const key = draftKey(profile, form);
  const [state, setState] = useState(() => ({
    key,
    values: loadDraft(key, initial),
  }));
  const values = state.key === key ? state.values : loadDraft(key, initial);
  const current = useRef({ key, values });
  const [saved, setSaved] = useState<boolean | null>(null);
  useEffect(() => {
    current.current = { key, values };
  }, [key, values]);
  function setValues(next: SetStateAction<T>) {
    const previous =
      current.current.key === key
        ? current.current.values
        : loadDraft(key, initial);
    const updated = typeof next === "function" ? next(previous) : next;
    current.current = { key, values: updated };
    const ok = storeDraft(key, updated);
    setSaved(ok);
    setState({ key, values: updated });
    return ok;
  }
  return [
    values,
    setValues,
    {
      saved: state.key === key ? saved : null,
      clear: () => clearDraft(key),
      save: (next: T) => setValues(next),
    },
  ] as const;
}
