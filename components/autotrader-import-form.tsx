'use client';
import {useActionState,useState} from 'react';
import Link from 'next/link';
import {importStock} from '../app/dashboard/vehicles/import/actions';
import {parseStockCsv,missingVehicleFields,MAX_IMPORT_BYTES,type ImportVehicle} from '../lib/autotrader-import';
import {SubmitButton} from './submit-button';
export function AutotraderImportForm() {
  const [rows,setRows]=useState<ImportVehicle[]>([]);const [error,setError]=useState('');const [reading,setReading]=useState(false);const [generation,setGeneration]=useState(0);
  async function load(file?:File) {setRows([]);setError('');setGeneration(n=>n+1);if(!file) return;if(file.size>MAX_IMPORT_BYTES){setError('Choose a CSV file no larger than 1 MB.');return;}setReading(true);try{setRows(parseStockCsv(await file.text()));}catch(e){setError(e instanceof Error ? e.message : 'Unable to read CSV.');}finally{setReading(false);}}
  return <><label>Authorized stock CSV<input type="file" accept=".csv,text/csv" disabled={reading} onChange={event=>void load(event.target.files?.[0])} /></label>{reading && <p role="status">Reading CSV…</p>}{error && <p className="alert danger" role="alert">{error}</p>}{rows.length>0 && <><h3>Preview — {rows.length} vehicle(s)</h3><p className="muted">All rows will be Draft. Existing matches by Auto Trader stock ID, registration or VIN will be skipped; existing stock is never overwritten.</p><div className="table-scroll"><table><thead><tr><th>Stock ID</th><th>Registration</th><th>Make/model</th><th>Year</th><th>Mileage</th><th>VIN</th><th>Price (£)</th><th>Gearbox</th><th>Missing before Available</th></tr></thead><tbody>{rows.map((row,index)=><tr key={index}><td>{row.stock_id || '—'}</td><td>{row.registration || 'Missing'}</td><td>{[row.make,row.model].filter(Boolean).join(' ') || 'Missing'}</td><td>{row.model_year || 'Missing'}</td><td>{row.mileage || 'Missing'}</td><td>{row.vin || 'Optional / blank'}</td><td>{row.asking_price || 'Missing'}</td><td>{row.gearbox || 'Missing'}</td><td>{missingVehicleFields(row).map(key=>key==='model_year' ? 'year' : key).join(', ') || 'Complete'}</td></tr>)}</tbody></table></div><ConfirmImport key={generation} rows={rows} /></>}</>;
}
function ConfirmImport({rows}:{rows:ImportVehicle[]}) {
  const [state,action]=useActionState(importStock,{});
  return <form action={action} className="form-stack"><input type="hidden" name="rows" value={JSON.stringify(rows)} /><label className="check-label"><input type="checkbox" name="confirm" required />I confirm this file contains authorized Hydra Motors stock and approve importing these rows as Drafts.</label>{state.error && <p className="alert danger" role="alert">{state.error}</p>}{state.success && <p className="alert success" role="status">{state.success} <Link href="/dashboard/vehicles?status=draft">Review draft stock</Link></p>}<SubmitButton disabled={!!state.success} pending="Importing drafts…">Import as Drafts</SubmitButton></form>;
}
