export const invoicePaymentOptions=[{value:'',label:'Not specified'},{value:'cash',label:'Cash'},{value:'card',label:'Card'},{value:'bank_transfer',label:'Bank transfer'}];
export function invoicePaymentLabel(value:string|null|undefined) {return invoicePaymentOptions.find(option=>option.value===value)?.label ?? 'Not specified';}
