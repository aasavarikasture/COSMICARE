export const colors = {
  // Core palette - COSMICARE visual identity
  deepblack: 'hsl(220 15% 5%)',
  charcoal: 'hsl(220 15% 8%)',
  'near-black': 'hsl(220 20% 10%)',
  'warm-ivory': '#f5f0e8',
  offwhite: '#f5f5f0',
  'muted-silver': 'hsl(0 0% 65%)',
  'restrained-grey': 'hsl(0 0% 52%)',
  'celestial-blue': 'hsl(205 25% 60%)',
  'desaturated-cyan': 'hsl(195 25% 55%)',
  'dusty-violet': 'hsl(270 15% 45%)',
  'soft-amber': 'hsl(40 30% 55%)',
  'restrained-red': '#a83739',
  'muted-green': 'hsl(100 15% 45%)',

  // UI surface variants
  surface: 'hsl(220 18% 12%)',
  'surface-muted': 'hsl(220 16% 15%)',
  'surface-elevated': 'hsl(220 16% 18%)',

  // States
  critical: '#a83739',
  warning: '#c4a765',
  success: '#6c7a5a',
  info: 'hsl(205 25% 60%)',

  // Transparent/overlay
  overlay: 'rgba(10, 10, 15, 0.7)',
};

export const typography = {
  // Editorial serif for headings
  serif: {
    fontFamily: '"Cormorant Garamond", "DM Serif Display", "Serif"',
    size1: 'clamp(2.5rem, 6vw, 4rem)',    // Hero headline
    size2: 'clamp(2rem, 4vw, 3rem)',      // Section headings
    size3: 'clamp(1.5rem, 3vw, 2rem)',    // Subheadings
    size4: '1.125rem',                    // Body fallback
  },

  // Sans-serif for interface
  sans: {
    fontFamily: '"DM Sans", "Inter", system-ui, -apple-system, sans-serif',
    xs: '0.75rem',                       // Caption
    sm: '0.875rem',                      // Small text
    md: '1rem',                          // Body
    lg: '1.125rem',                      // Large body
    xl: '1.25rem',                       // Footer/text
    '2xl': '1.5rem',                     // Section subtitles
  },

  // Monospace for scientific data
  mono: {
    fontFamily: '"IBM Plex Mono", "SF Mono", "Roboto Mono", monospace',
    size: '0.875rem',
  },
};

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
  '3xl': '4rem',
};

export const borders = {
  none: 'none',
  default: '1px solid hsl(0 0% 80%)',
  subtle: '1px solid hsl(0 0% 85%)',
  focus: '2px solid var(--celestial-blue)',
};

export const radius = {
  none: '0',
  sm: '4px',
  md: '8px',
  lg: '12px',
  full: '9999px',
};

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
};

export const zIndex = {
  base: 0,
  overlay: 1000,
  dropdown: 1100,
  sticky: 1020,
};

export const breakpoints = {
  sm: '@media (min-width: 640px)',
  md: '@media (min-width: 768px)',
  lg: '@media (min-width: 1024px)',
  xl: '@media (min-width: 1280px)',
  '2xl': '@media (min-width: 1536px)',
};
