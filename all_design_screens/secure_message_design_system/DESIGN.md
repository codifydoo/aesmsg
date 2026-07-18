---
name: Secure Message Design System
colors:
  surface: '#141218'
  surface-dim: '#141218'
  surface-bright: '#3b383e'
  surface-container-lowest: '#0f0d13'
  surface-container-low: '#1d1b20'
  surface-container: '#211f24'
  surface-container-high: '#2b292f'
  surface-container-highest: '#36343a'
  on-surface: '#e6e0e9'
  on-surface-variant: '#cbc4d2'
  inverse-surface: '#e6e0e9'
  inverse-on-surface: '#322f35'
  outline: '#948e9c'
  outline-variant: '#494551'
  surface-tint: '#cfbcff'
  primary: '#cfbcff'
  on-primary: '#381e72'
  primary-container: '#6750a4'
  on-primary-container: '#e0d2ff'
  inverse-primary: '#6750a4'
  secondary: '#cdc0e9'
  on-secondary: '#342b4b'
  secondary-container: '#4d4465'
  on-secondary-container: '#bfb2da'
  tertiary: '#e7c365'
  on-tertiary: '#3e2e00'
  tertiary-container: '#c9a74d'
  on-tertiary-container: '#503d00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#cfbcff'
  on-primary-fixed: '#22005d'
  on-primary-fixed-variant: '#4f378a'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#cdc0e9'
  on-secondary-fixed: '#1f1635'
  on-secondary-fixed-variant: '#4b4263'
  tertiary-fixed: '#ffdf93'
  tertiary-fixed-dim: '#e7c365'
  on-tertiary-fixed: '#241a00'
  on-tertiary-fixed-variant: '#594400'
  background: '#141218'
  on-background: '#e6e0e9'
  surface-variant: '#36343a'
typography:
  display:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  h1:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h2:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.05em
  mono-code:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  xxl: 80px
---

## Brand & Style

This design system is built on the pillars of **Precision Privacy** and **Institutional Trust**. It rejects the cliché "hacker" aesthetic in favor of a high-end, editorial approach to security. The goal is to make encryption feel like a premium utility rather than a technical hurdle.

The aesthetic combines the airy, deliberate whitespace of Apple’s interface design with the high-density information clarity found in modern developer tools like Linear or Vercel. Surfaces are treated as physical layers of glass and matte metal, utilizing subtle translucency and micro-borders to define hierarchy. The user should feel a sense of calm and total control, reinforced by "quiet" interfaces that only demand attention through purposeful action.

## Colors

The palette is optimized for deep-work environments and low-light scenarios. The foundation is a "Midnight Navy" black, providing more depth than a pure hex black. 

- **Surfaces:** Use `#111827` for the primary content areas and `#151B2D` for interactive elements like cards or hover states.
- **Accents:** The Electric Blue to Violet gradient is reserved for primary actions and brand-defining moments. It should be used sparingly to maintain the "Calm" mood.
- **Status:** Semantic colors are desaturated to ensure they don't vibrate against the dark background, maintaining a professional tone even during errors or warnings.

## Typography

Typography is the primary driver of the UI's "Premium" feel. 

- **Headlines:** Use Geist for a technical, modern edge. Display and H1 styles should use tight letter spacing to create a "locked-in" confident look.
- **Body:** Inter is utilized for its exceptional legibility at small sizes and high-contrast dark environments.
- **Technical Data:** Any cryptographic fingerprints, public keys, or secure links must use JetBrains Mono. This provides a clear visual distinction between "human conversation" and "machine security."

## Layout & Spacing

The layout philosophy emphasizes **Centralized Focus**. Because the product deals with sensitive messages, the layout should avoid cluttering the periphery.

- **The Focus Column:** Most core interactions (reading a message, entering a key) should happen within a 640px centered container.
- **Rhythm:** An 8px linear scale governs all margins and paddings. 
- **Grid:** Use a 12-column fluid grid for dashboard views, but prefer a "No Grid" contextual approach for the encrypted message viewing experience to maximize the "Apple-like" simplicity.

## Elevation & Depth

Depth in this design system is created through **Luminance and Borders** rather than traditional drop shadows.

1.  **Level 0 (Base):** The Background color (`#070A12`).
2.  **Level 1 (Surface):** The Main Surface (`#111827`) with a 1px border of `rgba(255,255,255,0.08)`.
3.  **Level 2 (Elevated):** The Elevated Surface (`#151B2D`). Use a subtle inner-glow (top white border 0.1 opacity) to simulate light catching the edge of a physical object.
4.  **Glassmorphism:** For overlays or navigation bars, use a 20px backdrop-blur with a 60% opacity fill of the Background color. This maintains context while focusing the user.

## Shapes

The shape language is "Soft-Modern." 

- **Primary Elements:** Buttons and Input fields use the `rounded-md` (0.5rem) standard.
- **Containers:** Large cards or message bubbles use `rounded-lg` (1rem).
- **Interactive Micro-elements:** Checkboxes and small tags use `rounded-sm` (0.25rem).

Avoid full-pill shapes unless used for status indicators (tags/chips). The goal is a structured, architectural feel.

## Components

### Buttons
- **Primary:** Gradient background (Blue to Violet), white text, subtle `0 0 15px` outer glow on hover to suggest energy/activity.
- **Secondary:** Transparent background with the system border. Subtle white fill (0.04 opacity) on hover.
- **Ghost:** No border, muted text. Turns to primary text color on hover.

### Inputs
- **Secure Fields:** Should feature a "monospaced" typing state by default. Focus states should be indicated by a 1px solid Electric Blue border—never a heavy outer glow.

### Key Cards
- Elements displaying public keys or fingerprints should have a distinct background (`#070A12`) and use JetBrains Mono. Include a "Copy" icon that provides immediate visual feedback ( Emerald checkmark) upon click.

### Encryption Status Chips
- Small, uppercase labels with a 1px desaturated border matching the status color (Emerald for Safe, Amber for Warning). These act as the "seal of quality" for the link.

### Message Bubbles
- Unlike social chat apps, message bubbles here should have generous padding (24px) and high-contrast typography to emphasize the importance of the content.