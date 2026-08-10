/** @type {import('tailwindcss').Config} */
// Tailwind reads the SAME CSS variables the ThemeProvider sets at runtime, so
// utility classes (bg-surface, text-dim, text-accent…) and any custom CSS stay
// in sync with the live theme. Never hardcode a hex in a component — use these.
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Themeable (persisted to joshos_theme, mirrored to mobile)
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        border: 'var(--border)',
        text: 'var(--text)',
        dim: 'var(--text-dim)',
        muted: 'var(--text-muted)',
        faint: 'var(--text-faint)',
        accent: 'var(--accent)',
        accent2: 'var(--accent2)',
        accent3: 'var(--accent3)',
        // Fixed JoshOS shell chrome (not themeable)
        brand: 'var(--brand)',
        'sidebar-bg': 'var(--sidebar-bg)',
        'login-bg': 'var(--login-bg)',
        success: 'var(--success)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
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
