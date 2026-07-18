import { MaterialIcon } from "@aesmsg/ui";

export interface PlaceholderProps {
  /** Material Symbols ligature name (must exist in the vendored subset). */
  icon: string;
  title: string;
  body: string;
}

/**
 * A calm "lands in a later release" panel for routes whose real flow ships in a
 * later sub-project. Presentational only; design-token classes, no hardcoded values.
 */
export function Placeholder({ icon, title, body }: PlaceholderProps) {
  return (
    <section className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container p-8 text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
          <MaterialIcon name={icon} size={28} />
        </div>
        <h1 className="text-h2 font-display text-on-surface">{title}</h1>
        <p className="mt-3 text-body-md text-on-surface-variant">{body}</p>
        <p className="mt-6 text-label-sm uppercase tracking-widest text-primary">
          Coming in a later release
        </p>
      </div>
    </section>
  );
}
