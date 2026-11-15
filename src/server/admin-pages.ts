import "server-only";
import { redirect } from "next/navigation";
import { currentAdmin } from "./auth";

export async function requireAdminPage(){
  const admin=await currentAdmin();
  if(!admin)redirect("/admin");
  return admin;
}
