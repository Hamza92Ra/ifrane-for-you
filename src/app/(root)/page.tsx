import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isLocale } from "@/i18n";
export default async function HomeRedirect() { const choice=(await cookies()).get("locale")?.value; redirect(`/${choice&&isLocale(choice)?choice:"fr"}`); }
