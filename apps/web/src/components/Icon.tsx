import { MaterialIcon, type MaterialIconProps } from "@aesmsg/ui";

/**
 * Decorative Material Symbols icon.
 *
 * Every icon in this presentational site sits beside a visible text label, so it
 * carries no information of its own and must not be announced by assistive tech
 * (otherwise a screen reader reads the raw ligature name — "lock", "chevron_right",
 * "content_copy" — as page content).
 *
 * `MaterialIcon` (in `@aesmsg/ui`) does not accept an `aria-hidden` prop, so we wrap
 * it in a `display: contents` span carrying `aria-hidden`. `display: contents`
 * generates no box, so the inner icon stays the exact same flex/grid item with all
 * its classes intact — layout is byte-identical to rendering `MaterialIcon` directly,
 * while the whole subtree is removed from the accessibility tree.
 */
export function Icon(props: MaterialIconProps) {
  return (
    <span aria-hidden="true" style={{ display: "contents" }}>
      <MaterialIcon {...props} />
    </span>
  );
}
