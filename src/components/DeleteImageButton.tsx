"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function DeleteImageButton({id}:{id:string}) {
  const [busy,setBusy]=useState(false);
  const router=useRouter();
  return <button type="button" className="admin-danger" disabled={busy} onClick={async()=>{if(!window.confirm("Supprimer cette photo ?"))return;setBusy(true);try{const r=await fetch("/api/admin/images",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});if(!r.ok)throw new Error();router.refresh()}catch{window.alert("Suppression impossible. Réessayez.")}finally{setBusy(false)}}}>Supprimer</button>;
}
