export function SocialIcon({network}:{network:"instagram"|"facebook"}){
  return network==="instagram"?<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7"/><circle cx="17.7" cy="6.5" r="1.1" fill="currentColor"/></svg>:<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.7c0-.9.3-1.5 1.6-1.5h1.7V3.3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.3V13h2.8v8h3.4Z"/></svg>;
}
