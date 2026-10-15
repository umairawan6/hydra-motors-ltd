'use client';
import {useState,useTransition,type FormEvent} from 'react';
import {BusinessForm,type FormField} from './business-form';
import {findSaleRecords,saveDraft} from '../app/dashboard/sales/actions';
type Option={value:string;label:string};
export function SaleDraftForm({fields}:{fields:FormField[]}) {
  const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(fields.map(f=>[f.name,f.value ?? ''])));
  const initial=(name:string)=>fields.find(f=>f.name===name)?.options ?? [];
  const [customers,setCustomers]=useState<Option[]>(()=>initial('customer_id'));
  const [vehicles,setVehicles]=useState<Option[]>(()=>initial('vehicle_id'));
  const [message,setMessage]=useState('');const [error,setError]=useState('');const [pending,startTransition]=useTransition();
  function find(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const form=new FormData(event.currentTarget);setError('');setMessage('');
    startTransition(async()=>{
      try {
        const result=await findSaleRecords(String(form.get('customer_search') ?? ''),String(form.get('vehicle_search') ?? ''));
        if(result.error){setError(result.error);return;}
        const retain=(matches:Option[],previous:Option[],selected:string)=>{
          const current=previous.find(option=>option.value===selected);
          return [{value:'',label:'Choose a record'},...matches,...(current?.value && !matches.some(option=>option.value===selected) ? [current] : [])];
        };
        setCustomers(previous=>retain(result.customers,previous,values.customer_id));
        setVehicles(previous=>retain(result.vehicles,previous,values.vehicle_id));
        setValues(previous=>({...previous,customer_id:String(form.get('customer_search') ?? '').trim() && result.customers.length===1 ? result.customers[0].value : previous.customer_id,vehicle_id:String(form.get('vehicle_search') ?? '').trim() && result.vehicles.length===1 ? result.vehicles[0].value : previous.vehicle_id}));
        setMessage(result.customers.length+' customer matches; '+result.vehicles.length+' vehicle matches. One match is selected automatically. Up to 50 of each are shown; refine your search if needed. Existing selections are retained when outside the results.');
      } catch {setError('Unable to search records. Check your connection and try again.');}
    });
  }
  const draftFields=fields.map(f=>f.name==='customer_id' ? {...f,options:customers} : f.name==='vehicle_id' ? {...f,options:vehicles} : f);
  return <><form onSubmit={find} className="list-controls" aria-label="Find sale records"><label>Customer name<input name="customer_search" maxLength={100} disabled={pending} /></label><label>Vehicle registration<input name="vehicle_search" maxLength={100} disabled={pending} /></label><button type="submit" className="button secondary" disabled={pending}>{pending ? 'Finding records…' : 'Find records'}</button></form>{message && <p className="alert success" role="status">{message}</p>}{error && <p className="alert danger" role="alert">{error}</p>}<fieldset disabled={pending} style={{border:0,padding:0,margin:0,minWidth:0}}><BusinessForm action={saveDraft} fields={draftFields} submit="Save draft" controlled={{values,onChange:setValues}} description="Select a customer and an available vehicle below. Finding records keeps your entered prices and charges." /></fieldset></>;
}
