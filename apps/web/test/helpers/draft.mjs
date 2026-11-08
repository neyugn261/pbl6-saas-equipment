export function draftHook(tab, h, session = tab.session) {
  return tab.load("features/workspace/use-form-draft.ts", {
    react: h.react,
    "../../auth/session": session,
    "./ui-draft": tab.load("features/workspace/ui-draft.ts"),
  });
}
