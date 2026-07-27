"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark"
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem("media-platform-theme", theme);
}

export function ThemeToggle({
  compact = false
}: {
  compact?: boolean;
}) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function toggle(): void {
    const next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  const label =
    theme === "dark"
      ? "Switch to light mode"
      : "Switch to dark mode";

  return (
    <button
      type="button"
      className="mp-button mp-theme-toggle"
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "◐"}</span>
      {!compact && <span>{theme === "dark" ? "Light" : "Dark"}</span>}
    </button>
  );
}
