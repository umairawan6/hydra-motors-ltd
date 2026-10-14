export function money(value: number | string) { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value)); }
export function date(value: string) { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium' }).format(new Date(value.length===10 ? `${value}T12:00:00Z` : value)); }
export function searchInput(value?: string) { return (value ?? '').trim().slice(0,100).replace(/[%_\\,()]/g,''); }
export function todayLondon() {const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const value=(type:string)=>parts.find(part=>part.type===type)?.value;return `${value('year')}-${value('month')}-${value('day')}`;}
