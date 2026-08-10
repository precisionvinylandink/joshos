/** @type {import('tailwindcss').Config} */
// Tailwind reads the SAME CSS variables the ThemeProvider sets at runtime, so
// utility classes (bg-surface, text-dim, text-accent…) and any custom CSS stay
// in sync with the live theme. Never hardcode a hex in a component — use these.
//
// The vars hold FULL colors (hex), so to support opacity modifiers (bg-brand/10,
// border-brand/40, bg-bg/95 …) each color is a function that emits color-mix when
// an alpha is requested. Solid usage stays `var(--x)`.
const v =
  (name) =>
  ({ opacityValue }) =>
    opacityValue === undefined
      ? `var(${name})`
      : `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`;

module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Themeable (persisted to joshos_theme, mirrored to mobile)
        bg: v('--bg'),
        surface: v('--surface'),
        surface2: v('--surface2'),
        border: v('--border'),
        text: v('--text'),
        dim: v('--text-dim'),
        muted: v('--text-muted'),
        faint: v('--text-faint'),
        accent: v('--accent'),
        accent2: v('--accent2'),
        accent3: v('--accent3'),
        // Fixed JoshOS shell chrome (not themeable)
        brand: v('--brand'),
        'sidebar-bg': v('--sidebar-bg'),
        'login-bg': v('--login-bg'),
        success: v('--success'),
        danger: v('--danger'),
        warning: v('--warning'),
      },
      fontFamily: {
        display: 'var(--font-display)',
        mono: 'var(--font-mono)',
        body: 'var(--font-body)',
        sans: 'var(--font-body)',
      },
      borderRadius: {
        theme: 'var(--radius)',
      },
    },
  },
  plugins: [],
};
