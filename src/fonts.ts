import localFont from "next/font/local";

export const serifFont = localFont({
  src: "../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff2",
  display: "swap",
  variable: "--font-serif"
});

export const sansFont = localFont({
  src: [
    { path: "../node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff2", weight: "400" },
    { path: "../node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-600-normal.woff2", weight: "600" }
  ],
  display: "swap",
  variable: "--font-sans"
});

export const arabicFont = localFont({
  src: "../node_modules/@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-400-normal.woff2",
  display: "swap",
  variable: "--font-arabic"
});
