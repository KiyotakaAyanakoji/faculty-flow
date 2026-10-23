import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
  className?: string;
  style?: React.CSSProperties;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', style }) => {
  const { actualTheme, toggleTheme } = useTheme();
  const isDark = actualTheme === 'dark';

  return (
    <button
      type="button"
      id="btn-theme-toggle"
      data-testid="theme-toggle-btn"
      className={`theme-toggle-btn ${className}`}
      onClick={toggleTheme}
      style={style}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      title={isDark ? 'Switch to Light Mode (Warm Ivory)' : 'Switch to Dark Mode (Deep Ocean)'}
    >
      <div className="theme-toggle-icon-wrap">
        {isDark ? (
          <Sun size={17} className="theme-icon sun-icon" />
        ) : (
          <Moon size={17} className="theme-icon moon-icon" />
        )}
      </div>
      <span className="theme-toggle-label">
        {isDark ? 'Light' : 'Dark'}
      </span>
    </button>
  );
};
