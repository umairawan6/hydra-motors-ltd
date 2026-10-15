'use client';
import {useState} from 'react';
import {BusinessForm,type FormField} from './business-form';
import {saveVehicle} from '../app/dashboard/vehicles/actions';
const requiredFields=new Set(['registration','make','model','model_year','mileage']);
export function VehicleForm({fields}:{fields:FormField[]}) {
  const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(fields.map(field=>[field.name,field.value ?? ''])));
  const incompleteAllowed=values.status==='draft' || values.status==='archived';
  return <BusinessForm action={saveVehicle} controlled={{values,onChange:setValues}} fields={fields.map(field=>requiredFields.has(field.name) ? {...field,required:!incompleteAllowed} : field)} description={incompleteAllowed ? 'Draft vehicles can have missing details and cannot be sold. Complete registration, make, model, year and mileage before marking Available. VIN is optional.' : 'Registration, make, model, year and mileage are required. VIN is optional.'} />;
}
