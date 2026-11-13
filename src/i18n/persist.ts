import type { Locale } from "./index";
export function persistLocale(locale: Locale) {
  document.cookie = `locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
