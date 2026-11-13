import "../globals.css";
import { sansFont, serifFont } from "@/fonts";
export default function RootRedirectLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><body className={`${serifFont.variable} ${sansFont.variable}`}>{children}</body></html>;
}
