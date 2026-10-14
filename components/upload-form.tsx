'use client';
import {useActionState,useState} from 'react';
import {SubmitButton} from './submit-button';
import type {ActionState} from '../lib/validation';
export function UploadForm({action,id,accept,label}:{action:(state:ActionState,form:FormData)=>Promise<ActionState>;id:string;accept:string;label:string}) {
  const [state,formAction]=useActionState(action,{});
  const [fileError,setFileError]=useState('');
  return <form action={formAction} className="form-stack"><input type="hidden" name="id" value={id} /><label>{label}<input name="file" type="file" required accept={accept} onChange={event=>{const file=event.target.files?.[0];setFileError(file && (file.size===0 || file.size>5*1024*1024) ? 'Choose a non-empty file up to 5 MB.' : '');}} /></label><SubmitButton pending="Uploading…" disabled={Boolean(fileError)}>Upload file</SubmitButton>{fileError && <p className="alert danger" role="alert">{fileError}</p>}{state.error && <p className="alert danger" role="alert">{state.error}</p>}{state.success && <p className="alert success" role="status">{state.success}</p>}</form>;
}
