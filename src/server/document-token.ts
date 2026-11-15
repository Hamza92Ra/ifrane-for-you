import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(){const value=process.env.DOCUMENT_TOKEN_SECRET;if(!value||value.length<32)throw new Error("DOCUMENT_TOKEN_SECRET is not configured");return value;}
const lifetimeSeconds=7*24*60*60;
export function reservationDocumentToken(reservationId:string,requestKey:string){const issuedAt=Math.floor(Date.now()/1000);const signature=createHmac("sha256",secret()).update(`${reservationId}:${requestKey}:${issuedAt}`).digest("base64url");return `${issuedAt}.${signature}`;}
export function validDocumentToken(reservationId:string,requestKey:string,token:string){
  const [issuedText,signature,...extra]=token.split(".");
  const issuedAt=Number(issuedText),now=Math.floor(Date.now()/1000);
  if(extra.length||!Number.isInteger(issuedAt)||issuedAt>now||now-issuedAt>lifetimeSeconds||!signature)return false;
  const expected=Buffer.from(createHmac("sha256",secret()).update(`${reservationId}:${requestKey}:${issuedAt}`).digest("base64url"));
  const supplied=Buffer.from(signature);
  return expected.length===supplied.length&&timingSafeEqual(expected,supplied);
}
