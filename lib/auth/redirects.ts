export function authDestination(next: string | null) { return next === '/update-password' ? '/update-password' : '/dashboard'; }
