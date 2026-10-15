import {z} from 'zod';
export const MAX_IMPORT_ROWS=200;
export const MAX_IMPORT_BYTES=1024*1024;
export const importRowSchema=z.object({stock_id:z.string().trim().max(100).regex(/^[A-Za-z0-9_-]*$/),registration:z.string().trim().max(20),make:z.string().trim().max(80),model:z.string().trim().max(120),vin:z.string().trim().max(40),model_year:z.string().regex(/^(?:\d{4})?$/).refine(v=>!v || (Number(v)>=1900 && Number(v)<=2100)),mileage:z.string().regex(/^\d{0,9}$/)}).refine(v=>!!(v.stock_id || v.registration || v.vin),'Each row needs an Auto Trader stock ID, registration or VIN so retries can be matched.');
export const importRowsSchema=z.array(importRowSchema).min(1).max(MAX_IMPORT_ROWS);
export type ImportVehicle=z.infer<typeof importRowSchema>;
const headers:Record<string,keyof ImportVehicle>={stockid:'stock_id',autotraderstockid:'stock_id',registration:'registration',registrationnumber:'registration',regnumber:'registration',reg:'registration',vrm:'registration',make:'make',model:'model',vin:'vin',year:'model_year',modelyear:'model_year',caryear:'model_year',mileage:'mileage'};
export function missingVehicleFields(row:ImportVehicle) {return (['registration','make','model','model_year','mileage'] as const).filter(key=>!row[key]);}
export function parseStockCsv(input:string):ImportVehicle[] {
  if(new TextEncoder().encode(input).length>MAX_IMPORT_BYTES) throw Error('Choose a CSV file no larger than 1 MB.');
  const text=input.replace(/^\uFEFF/,'');const records:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
  const endField=()=>{row.push(field);field='';closed=false;};
  const endRow=()=>{endField();if(row.some(value=>value.trim())) records.push(row);row=[];if(records.length>MAX_IMPORT_ROWS+1) throw Error('Import at most 200 vehicles at a time.');};
  for(let i=0;i<text.length;i++) {const c=text[i];
    if(quoted) {if(c==='"') {if(text[i+1]==='"') {field+='"';i++;} else {quoted=false;closed=true;}} else field+=c;continue;}
    if(c===',') {endField();continue;}
    if(c==='\n' || c==='\r') {if(c==='\r' && text[i+1]==='\n') i++;endRow();continue;}
    if(c==='"') {if(field || closed) throw Error('Invalid CSV quotation.');quoted=true;continue;}
    if(closed) {if(c===' ' || c==='\t') continue;throw Error('Unexpected text after a quoted CSV value.');}field+=c;
  }
  if(quoted) throw Error('Unclosed CSV quotation.');if(field || row.length || closed) endRow();
  if(records.length<2) throw Error('Include a header row and at least one vehicle.');
  const columns=records[0].map(name=>{const key=name.trim().toLowerCase().replace(/[\s_-]/g,'');return Object.hasOwn(headers,key) ? headers[key] : undefined;});
  const known=columns.filter(Boolean);if(!known.length || new Set(known).size!==known.length) throw Error('Use recognized, non-duplicate CSV headers.');
  return records.slice(1).map((values,index)=>{if(values.length!==columns.length) throw Error(`Row ${index+2}: column count does not match the headers.`);
    const payload:ImportVehicle={stock_id:'',registration:'',make:'',model:'',model_year:'',mileage:'',vin:''};
    columns.forEach((key,i)=>{if(key) payload[key]=values[i].trim();});
    payload.registration=payload.registration.replaceAll(' ','').toUpperCase();payload.vin=payload.vin.toUpperCase();payload.mileage=payload.mileage.replaceAll(',','');
    const parsed=importRowSchema.safeParse(payload);if(!parsed.success) throw Error(`Row ${index+2}: ${parsed.error.issues[0].message}`);return parsed.data;
  });
}
