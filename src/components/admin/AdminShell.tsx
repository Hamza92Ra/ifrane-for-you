import type { ReactNode } from "react";
import Link from "next/link";

const navigation=[
  ["/admin","Vue d’ensemble"],
  ["/admin/reservations","Réservations"],
  ["/admin/accommodations","Hébergements & unités"],
  ["/admin/pricing","Tarifs"],
  ["/admin/gallery","Galerie & photos"],
  ["/admin/services","Repas & services"],
  ["/admin/settings","Paramètres"]
] as const;
export function AdminShell({children,active,title,description}:{children:ReactNode;active:string;title:string;description?:string}){
  return <main id="main" className="admin-shell"><aside className="admin-sidebar"><Link className="admin-brand" href="/admin"><span className="admin-brand-mark">Ifrane For You</span><span>Espace de gestion</span></Link><nav aria-label="Navigation administration" className="admin-side-nav">{navigation.map(([href,label],index)=><Link href={href} key={href} className={href===active?"active":undefined} aria-current={href===active?"page":undefined}><span className="admin-side-index">0{index+1}</span>{label}</Link>)}</nav><p className="admin-sidebar-note">Un espace simple pour prendre soin de chaque séjour.</p></aside><div className="admin-workspace"><header className="admin-page-header"><div><p className="eyebrow">Ifrane For You · Administration</p><h1>{title}</h1>{description&&<p>{description}</p>}</div><form method="post" action="/api/admin/logout"><button className="admin-quiet">Se déconnecter</button></form></header>{children}</div></main>;
}
