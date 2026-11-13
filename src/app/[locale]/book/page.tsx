import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingForm } from "@/components/BookingForm";
import { SiteHeader } from "@/components/SiteHeader";
import { bookingText } from "@/i18n/booking";
import { isLocale } from "@/i18n";
import { databaseConfigured, db } from "@/server/db";
import { getDictionary } from "@/i18n";
import { businessText } from "@/server/catalog";
export const dynamic = "force-dynamic";
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;if(!isLocale(locale))return{};return{title:bookingText[locale].title,description:bookingText[locale].intro,robots:{index:false,follow:true}}}
export default async function BookPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{stay?:string}>}){
  const {locale}=await params;if(!isLocale(locale))notFound();const {stay}=await searchParams;const t=bookingText[locale],copy=getDictionary(locale);
  let options=[{slug:"dome",name:copy.dome.label},{slug:"cabin",name:copy.cabin.label}];
  if(databaseConfigured()) try {const rows=await db()`select slug,names from public.accommodation_types where published order by created_at`;options=rows.map(r=>({slug:String(r.slug),name:String(r.names?.[locale]||r.names?.fr||r.slug)}))} catch { /* Booking API reports unavailability. */ }
  const policy=await businessText(locale);
  return <><SiteHeader locale={locale} path="/book"/><main id="main" className="booking-page"><div className="page-container booking-shell"><div className="booking-intro"><p className="eyebrow">Ifrane For You</p><h1>{t.title}</h1><p>{t.intro}</p>{policy?.bookingPolicy&&<p className="booking-policy">{policy.bookingPolicy}</p>}{policy?.arrivalPolicy&&<p className="booking-policy">{policy.arrivalPolicy}</p>}</div><BookingForm locale={locale} options={options} initialStay={options.some(o=>o.slug===stay)?stay:undefined}/></div></main></>;
}
