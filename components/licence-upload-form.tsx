'use client';
import {useActionState,useState} from 'react';
import {uploadLicence} from '../app/dashboard/customers/licence-actions';
import {SubmitButton} from './submit-button';
export function LicenceUploadForm({id,side}:{id:string;side:'front'|'back'}) {
  const [state,action]=useActionState(uploadLicence,{});const [camera,setCamera]=useState(false);const [error,setError]=useState('');
  return <form action={action} className="form-stack"><input type="hidden" name="id" value={id} /><input type="hidden" name="side" value={side} />
    <div className="list-controls"><button className="button secondary" type="button" aria-pressed={!camera} onClick={()=>{setCamera(false);setError('');}}>Choose image</button><button className="button secondary" type="button" aria-pressed={camera} onClick={()=>{setCamera(true);setError('');}}>Take photo</button></div>
    <label>{side==='front' ? 'Front' : 'Back'} licence image<input key={String(camera)} name="file" type="file" required accept="image/jpeg,image/png,image/webp" capture={camera ? 'environment' : undefined} onChange={event=>{const file=event.target.files?.[0];setError(file && (!file.size || file.size>3*1024*1024) ? 'Choose a non-empty image up to 3 MB.' : '');}} /></label>
    {camera && <p className="muted small">On supported phones this opens the rear camera. On other devices, choose an image instead.</p>}
    <SubmitButton pending="Uploading…" disabled={!!error}>Upload {side} image</SubmitButton>{(error || state.error) && <p className="alert danger" role="alert">{error || state.error}</p>}{state.success && <p className="alert success" role="status">{state.success}</p>}
  </form>;
}
