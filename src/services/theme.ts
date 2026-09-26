export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'yt-theme';

/**
 * Reads the stored theme or system preference.
 */
export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // Ignore storage/iframe security restrictions
  }
  return 'light';
}

/**
 * Applies the theme to <html> and persists to localStorage.
 */
export function setTheme(theme: ThemeMode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage restrictions
    }
  }
}

/**
 * Initializes the theme before React render or on startup.
 */
export function initTheme(): ThemeMode {
  const theme = getInitialTheme();
  setTheme(theme);
  return theme;
}
