import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translate, type Language, type TranslationKey, type TranslationValues } from "@/lib/i18n";
import { initialLanguage } from "@/services/storageMigration";

export type Theme = "light" | "dark";
interface PreferencesValue {
  theme: Theme;
  language: Language;
  toggleTheme: () => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => localStorage.getItem("kempt.theme") === "dark" ? "dark" : "light");
  const [language, setLanguage] = useState<Language>(() => initialLanguage(localStorage));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("kempt.theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = language === "zh" ? "Kempt" : "Kempt";
    localStorage.setItem("kempt.language", language);
  }, [language]);

  const t = useCallback((key: TranslationKey, values?: TranslationValues) => translate(language, key, values), [language]);
  const value = useMemo(() => ({
    theme,
    language,
    toggleTheme: () => setTheme((current) => current === "light" ? "dark" : "light"),
    toggleLanguage: () => setLanguage((current) => current === "zh" ? "en" : "zh"),
    t,
  }), [theme, language, t]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used within PreferencesProvider");
  return value;
}
