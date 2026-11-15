import Link from "next/link";
import type { Metadata } from "next";
import { currentAdmin,authConfigured } from "@/server/auth";
import { db } from "@/server/db";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Administration | Ifrane For You",robots:{index:false,follow:false}};
const ADMIN_QUERY_TIMEOUT_MS = 8_000;
async function withAdminTimeout<T>(operation: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("ADMIN_QUERY_TIMEOUT")), ADMIN_QUERY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function AdminUnavailable() {
  return <main id="main" className="admin-login"><div className="admin-login-card"><p className="eyebrow">Ifrane For You</p><h1>Administration</h1><p role="alert" className="admin-alert">Le tableau de bord est temporairement indisponible. Veuillez réessayer.</p><form action="/admin" method="get"><button className="admin-button" type="submit">Réessayer</button></form></div></main>;
}
export default async function AdminOverview({searchParams}:{searchParams:Promise<{error?:string;ok?:string}>}){
  const query=await searchParams;
  const admin=await withAdminTimeout(currentAdmin()).catch(()=>undefined);
  if(admin===undefined)return <AdminUnavailable/>;
  if(!admin)return <main id="main" className="admin-login"><div className="admin-login-card"><p className="eyebrow">Ifrane For You</p><h1>Administration</h1><p>Connectez-vous pour gérer les réservations et les hébergements.</p>{!authConfigured()&&<p className="admin-alert">Connexion Supabase à configurer. Consultez le guide d’installation.</p>}{query.error&&<p className="admin-alert" role="alert">Connexion refusée ou service indisponible.</p>}<form method="post" action="/api/admin/login" className="admin-form"><label>Adresse e-mail<input name="email" type="email" required autoComplete="username"/></label><label>Mot de passe<input name="password" type="password" required autoComplete="current-password"/></label><button className="admin-button">Se connecter</button></form></div></main>;
  const sql=db();
  let stats;
  let upcoming;
  try {
    stats=await withAdminTimeout(sql`select (select count(*) from public.reservations)::int as total,(select count(*) from public.reservations where status='PENDING')::int as pending,(select count(*) from public.reservations where status='CONFIRMED')::int as confirmed,(select count(distinct unit_id) from public.reservations where status='CONFIRMED' and check_in<=current_date and check_out>current_date)::int as occupied,(select count(*) from public.accommodation_units u where u.active and not exists(select 1 from public.reservations r where r.unit_id=u.id and r.status='CONFIRMED' and r.stay @> current_date) and not exists(select 1 from public.availability_blocks b where b.unit_id=u.id and b.active and b.period @> current_date))::int as available`);
    upcoming=await withAdminTimeout(sql`select reference,customer_name,check_in,check_out from public.reservations where status='CONFIRMED' and (check_in between current_date and current_date+7 or check_out between current_date and current_date+7) order by check_in limit 8`);
  } catch (error) {
    console.error("[admin] Overview query failed:", error instanceof Error ? error.message : "UNKNOWN");
    return <AdminUnavailable/>;
  }
  const s=stats[0];
  return <AdminShell active="/admin" title="Vue d’ensemble" description="Les informations essentielles et les prochains séjours, en un seul regard.">
    {query.ok&&<p className="admin-success" role="status">Modification enregistrée.</p>}{query.error&&<p className="admin-alert" role="alert">Action refusée : {query.error}</p>}
    <section className="admin-stats admin-stats--overview" aria-label="Activité des réservations"><div><strong>{s.total}</strong><span>Réservations au total</span></div><div><strong>{s.pending}</strong><span>En attente de réponse</span></div><div><strong>{s.confirmed}</strong><span>Confirmées</span></div><div><strong>{s.occupied}</strong><span>Unités occupées</span></div><div><strong>{s.available}</strong><span>Disponibles aujourd’hui</span></div></section>
    <section className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">La semaine à venir</p><h2>Prochains arrivées et départs</h2></div><Link className="admin-text-link" href="/admin/reservations">Voir les réservations <span aria-hidden="true">→</span></Link></div><div className="admin-upcoming">{upcoming.length?upcoming.map(row=><article key={row.reference}><strong>{row.customer_name}</strong><span>{row.reference}</span><time>{String(row.check_in).slice(0,10)} → {String(row.check_out).slice(0,10)}</time></article>):<p>Aucun séjour confirmé dans les sept prochains jours.</p>}</div></section>
    <section className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Accès rapide</p><h2>Que souhaitez-vous gérer ?</h2></div></div><div className="admin-shortcuts"><Link href="/admin/reservations"><span>01</span><strong>Répondre aux demandes</strong><span aria-hidden="true">↗</span></Link><Link href="/admin/accommodations"><span>02</span><strong>Gérer les hébergements</strong><span aria-hidden="true">↗</span></Link><Link href="/admin/pricing"><span>03</span><strong>Mettre à jour les tarifs</strong><span aria-hidden="true">↗</span></Link><Link href="/admin/gallery"><span>04</span><strong>Organiser les photos</strong><span aria-hidden="true">↗</span></Link></div></section>
  </AdminShell>;
}
