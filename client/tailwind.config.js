/** @type {import('tailwindcss').Config} */
// ─────────────────────────────────────────────────────────────────────────────
// Unify "Command Center" design tokens (light theme).
//
// This file is the single source of truth for every color/font/border/shadow
// utility the app resolves. It was re-skinned from a dark navy theme to Unify's
// official Command Center brand (component library v3.5): a LIGHT app surface
// (#F5F6F8 paper, white cards) with a DARK navy sidebar, aqua as the lone
// decorative accent, navy as the primary action color, and DM Sans / Fraunces /
// DM Mono typography.
//
// Naming intent:
//   - navy / aqua / yellow / paper / line are the brand tokens.
//   - ink = primary text, muted = secondary text, faint = placeholder text.
//   - success / warn / danger each carry a {DEFAULT, bg, border} triplet so a
//     status chip is "bg-X-bg text-X border-X-border".
//   - `accent` and `gold` are kept as backward-compat aliases (accent→aqua,
//     gold→legible amber) so any not-yet-migrated `text-accent`/`text-gold`
//     usage still renders something on-brand instead of disappearing.
//   - The numeric navy ramp (700–950) is retained and mapped onto real brand
//     navy shades; it is used by the (still dark) sidebar/avatars and acts as a
//     safety net for any leftover dark-theme utility during the migration.
// ─────────────────────────────────────────────────────────────────────────────
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // True white is now a real surface (cards/inputs), not a remapped near-value.
        white: '#FFFFFF',
        // `black` only feeds low-opacity utilities (e.g. border-black/40 on avatars)
        // and shadow math — point it at the deepest brand navy so those tints read
        // as navy, never pure black, on a light UI.
        black: '#0d2238',

        // Page + recessed surfaces.
        paper: {
          DEFAULT: '#F5F6F8', // app background
          deep: '#EDEEF1', // recessed wells: hover rows, disabled inputs, table headers
        },

        // Brand navy — text, headings, the sidebar, and the primary action fill.
        // Numeric keys keep the old elevation utilities resolving to brand navy.
        navy: {
          DEFAULT: '#14314f',
          deep: '#0d2238', // primary-button hover, deepest navy
          mid: '#1a3a5c', // mid navy fills, avatar gradients
          700: '#22436a',
          800: '#1a3a5c',
          850: '#1a3a5c',
          900: '#14314f',
          925: '#102a44',
          950: '#0d2238',
        },

        // Aqua — the ONLY decorative accent: active nav rail, focus rings, dots,
        // 3px card top-bars, in-progress chips. NOT safe as body text except `text`.
        aqua: {
          DEFAULT: '#1cc4bc',
          mid: '#5dd6d1', // lighter accent for use on dark navy (sidebar)
          light: '#e2f7f6', // pale tint backgrounds (chips, icon tiles)
          text: '#0a6e6a', // AA-safe teal (6.08:1 on white) — the only aqua usable AS text
        },

        // Brand yellow — emphasis only (max one per view). Poor contrast as text,
        // so `soft`/`deep` give a legible pale-bg + dark-amber-text pairing (used by WIP).
        yellow: {
          DEFAULT: '#FCED1E',
          soft: '#FCF7C8',
          deep: '#8a6500',
        },

        // Text roles.
        ink: '#14314f', // primary text (= navy)
        muted: '#565f67', // secondary/body text — AA 6.02:1 on paper
        faint: '#6b7177', // placeholder text only, never load-bearing
        line: '#E6E6E6', // explicit hairline borders / dividers (Unify --gray-light)

        // Semantic status triplets (tint bg + same-hue dark text + matching border).
        success: { DEFAULT: '#1a7a4a', bg: '#e8f5ee', border: 'rgba(26,122,74,0.25)' },
        warn: { DEFAULT: '#a06010', bg: '#fdf5e0', border: 'rgba(160,96,16,0.25)' },
        danger: { DEFAULT: '#b91c1c', bg: '#fde8e8', border: 'rgba(185,28,28,0.25)' },

        // ── Backward-compat aliases (keep migrating usages from disappearing) ──
        accent: {
          DEFAULT: '#1cc4bc', // → aqua (rails, badges, focus rings)
          hover: '#5dd6d1',
          deep: '#0a6e6a', // → aqua-text (links/icons)
        },
        gold: '#a06010', // → legible amber, so any leftover text-gold stays readable
      },
      fontFamily: {
        // DM Sans for all UI/body; Fraunces (always weight 300) for large display
        // figures like KPI numbers; DM Mono for labels, code, and tabular metadata.
        sans: ['DM Sans', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['DM Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      borderColor: {
        // Flipped from white-alpha (which vanished on light) to navy-alpha hairlines
        // so any `border-faint/subtle/strong` usage stays visible on paper/white.
        faint: 'rgba(20,49,79,0.05)',
        subtle: 'rgba(20,49,79,0.08)', // = Unify --rule
        strong: 'rgba(20,49,79,0.14)',
      },
      boxShadow: {
        // Lightened from near-black @ 0.5 opacity to soft navy-tinted elevation
        // appropriate for a light surface.
        card: '0 1px 2px rgba(20,49,79,0.06)',
        raised: '0 2px 12px rgba(13,34,56,0.10)',
        modal: '0 16px 48px rgba(13,34,56,0.18), 0 4px 12px rgba(13,34,56,0.12)',
      },
    },
  },
  plugins: [],
};
