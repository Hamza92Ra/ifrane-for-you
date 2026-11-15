import {db} from "@/server/db";
import {requireAdminPage} from "@/server/admin-pages";
import {AdminShell} from "@/components/admin/AdminShell";
import {AdminForm,BookingOptionEditor} from "@/components/admin/AdminForms";

export const dynamic="force-dynamic";
export default async function ServicesPage({searchParams}:{searchParams:Promise<{error?:string;ok?:string}>}){
  await requireAdminPage();const params=await searchParams,sql=db();const [types,items]=await Promise.all([sql`select * from public.accommodation_types order by created_at`,sql`select * from public.booking_options order by kind,sort_order,created_at`]);
  return <AdminShell active="/admin/services" title="Repas & services" description="Choisissez les options réellement proposées et configurez leurs tarifs exacts.">
    {params.ok&&<p className="admin-success" role="status">Modification enregistrée.</p>}{params.error&&<p className="admin-alert" role="alert">Action refusée : {params.error}</p>}
    <p className="admin-note">Aucune option ou aucun tarif n’est prérempli. Une option n’apparaît dans le parcours de réservation qu’après sa publication.</p><details className="admin-details"><summary>Créer un repas ou un service</summary><BookingOptionEditor types={types}/></details>
    <div className="admin-reservations">{items.map(item=><article className="admin-reservation" key={item.id}><div className="admin-reservation-head"><strong>{item.names?.fr} · {item.kind==="MEAL"?"Repas":"Service"}</strong><span>{item.active&&item.published?"Publié":"Masqué"}</span></div><p>{item.type_id?types.find(type=>type.id===item.type_id)?.names?.fr:"Toutes les catégories"} · {item.unit_price} {String(item.currency).trim()} · {item.pricing_basis}</p><BookingOptionEditor option={item} types={types}/>{item.active&&<AdminForm action="disable_booking_option" returnTo="/admin/services"><input type="hidden" name="id" value={item.id}/><button className="admin-danger">Désactiver</button></AdminForm>}</article>)}</div>
  </AdminShell>;
}
