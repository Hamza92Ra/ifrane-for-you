import {db} from "@/server/db";
import {requireAdminPage} from "@/server/admin-pages";
import {AdminShell} from "@/components/admin/AdminShell";
import {AdminField,AdminForm,TypeEditor} from "@/components/admin/AdminForms";

export const dynamic="force-dynamic";
const dateLabel=(value:unknown)=>String(value).slice(0,10);
export default async function AccommodationsPage({searchParams}:{searchParams:Promise<{error?:string;ok?:string}>}){
  await requireAdminPage();const params=await searchParams;const sql=db();
  const [types,units,blocks]=await Promise.all([
    sql`select * from public.accommodation_types order by created_at`,
    sql`select u.*,t.names from public.accommodation_units u join public.accommodation_types t on t.id=u.type_id order by t.slug,u.unit_code`,
    sql`select b.*,u.unit_code from public.availability_blocks b join public.accommodation_units u on u.id=b.unit_id order by b.created_at desc limit 100`
  ]);
  return <AdminShell active="/admin/accommodations" title="Hébergements & unités" description="Les catégories décrivent l’expérience. Les unités correspondent aux espaces réellement réservables.">
    {params.ok&&<p className="admin-success" role="status">Modification enregistrée.</p>}{params.error&&<p className="admin-alert" role="alert">Action refusée : {params.error}</p>}
    <p className="admin-note">Les capacités s’appliquent à chaque unité physique. Désactiver une unité conserve son historique et ses réservations.</p>
    {types.map(type=><details className="admin-details" key={type.id}><summary>{type.names?.fr||type.slug} · {units.filter(unit=>unit.type_id===type.id&&unit.active).length} unité(s) active(s) · capacité {type.max_guests??"à confirmer"}</summary><TypeEditor type={type}/><h3>Unités physiques</h3><div className="admin-list">{units.filter(unit=>unit.type_id===type.id).map(unit=><div key={unit.id} className="admin-list-row"><span>{unit.unit_code} · {unit.active?"active":"inactive"}</span><AdminForm action={unit.active?"deactivate_unit":"reactivate_unit"} returnTo="/admin/accommodations"><input type="hidden" name="id" value={unit.id}/><button className="admin-quiet">{unit.active?"Désactiver":"Réactiver"}</button></AdminForm></div>)}</div><AdminForm action="add_unit" returnTo="/admin/accommodations"><input type="hidden" name="type_id" value={type.id}/><AdminField label="Code unique de l’unité" name="unit_code" placeholder="Code de l’unité" required/><button className="admin-button">Ajouter une unité</button></AdminForm></details>)}
    <details className="admin-details"><summary>Ajouter une catégorie d’hébergement</summary><TypeEditor/></details>
    <div className="admin-two"><details className="admin-details"><summary>Bloquer des dates pour maintenance</summary><AdminForm action="add_block" returnTo="/admin/accommodations"><label>Unité<select name="unit_id">{units.filter(unit=>unit.active).map(unit=><option key={unit.id} value={unit.id}>{unit.names?.fr} · {unit.unit_code}</option>)}</select></label><AdminField label="À partir du" name="start_date" type="date" required/><AdminField label="Jusqu’au (exclus)" name="end_date" type="date" required/><AdminField label="Motif" name="reason" required/><button className="admin-button">Bloquer les dates</button></AdminForm></details><section className="admin-panel"><h2>Fermetures et maintenance</h2><div className="admin-list">{blocks.map(block=><div className="admin-list-row" key={block.id}><span>{block.unit_code} · {dateLabel(block.start_date)} → {dateLabel(block.end_date)} · {block.reason} · {block.active?"actif":"levé"}</span>{block.active&&<AdminForm action="remove_block" returnTo="/admin/accommodations"><input type="hidden" name="id" value={block.id}/><button className="admin-quiet">Lever</button></AdminForm>}</div>)}</div></section></div>
  </AdminShell>;
}
