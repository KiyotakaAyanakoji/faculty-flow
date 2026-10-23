import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';

const TestComponent = () => {
  const { theme, actualTheme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <div data-testid="current-theme">{theme}</div>
      <div data-testid="actual-theme">{actualTheme}</div>
      <ThemeToggle />
      <button onClick={() => setTheme('light')}>Set Light</button>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
      <button onClick={toggleTheme}>Toggle Mode</button>
    </div>
  );
};

describe('Theme System & Glassmorphism Mode Tests', () => {

  beforeEach(() => {
    // Clear data-theme before each test
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.className = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default theme and sets data-theme on documentElement', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const actualTheme = screen.getByTestId('actual-theme').textContent;
    expect(actualTheme).toMatch(/^(light|dark)$/);
    expect(document.documentElement.getAttribute('data-theme')).toBe(actualTheme);
  });

  it('toggles theme when clicking ThemeToggle button', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByTestId('theme-toggle-btn');
    const initialTheme = screen.getByTestId('actual-theme').textContent;
    const targetTheme = initialTheme === 'dark' ? 'light' : 'dark';

    act(() => {
      fireEvent.click(toggleBtn);
    });

    expect(screen.getByTestId('actual-theme').textContent).toBe(targetTheme);
    expect(document.documentElement.getAttribute('data-theme')).toBe(targetTheme);
    expect(document.documentElement.classList.contains(`theme-${targetTheme}`)).toBe(true);
  });

  it('allows setting explicit light and dark themes directly', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const setLightBtn = screen.getByRole('button', { name: /set light/i });
    const setDarkBtn = screen.getByRole('button', { name: /set dark/i });

    act(() => {
      fireEvent.click(setLightBtn);
    });
    expect(screen.getByTestId('actual-theme').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => {
      fireEvent.click(setDarkBtn);
    });
    expect(screen.getByTestId('actual-theme').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
