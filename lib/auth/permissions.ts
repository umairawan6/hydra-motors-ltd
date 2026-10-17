export const permissionLabels = {
  'customers.read': 'Read customers', 'customers.write': 'Manage customers',
  'customers.licence_read':'View customer driving licence images', 'customers.licence_manage':'Upload/remove customer driving licence images',
  'stock.read': 'Read vehicles', 'stock.write': 'Manage vehicles',
  'costs.read': 'Read vehicle costs', 'costs.write': 'Manage vehicle costs',
  'sales.read_all': 'Read all sales', 'sales.write': 'Manage sale drafts',
  'sales.issue': 'Issue customer invoices', 'invoices.credit': 'Credit or void invoices',
  'payments.manage': 'Record payments', 'finance.manage': 'Manage financial invoices',
  'reports.sales': 'Read sales reports', 'reports.profit': 'Read profit reports',
  'users.manage': 'Manage staff accounts', 'roles.manage': 'Manage role permissions', 'audit.read': 'Read audit log',
} as const;
export type Permission = keyof typeof permissionLabels;
export function isPermission(value: string): value is Permission { return Object.hasOwn(permissionLabels, value); }
export function can(permissions: readonly string[], permission: Permission) { return permissions.includes(permission); }
