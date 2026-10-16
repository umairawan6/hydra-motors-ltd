export const fuelTypes=['petrol','diesel','hybrid','diesel_hybrid','electric'] as const;
export const fuelOptions=[{value:'',label:'Not recorded'},...fuelTypes.map(value=>({value,label:value==='diesel_hybrid' ? 'Diesel hybrid' : value[0].toUpperCase()+value.slice(1)}))];
export function fuelLabel(value:string|null|undefined) {return fuelOptions.find(option=>option.value===value)?.label ?? '—';}
