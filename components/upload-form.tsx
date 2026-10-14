'use client';
import {useActionState} from 'react';
import {SubmitButton} from './submit-button';
import type {ActionState} from '../lib/validation';
export function UploadForm({action,id,accept,label}:{action:(state:ActionState,form:FormData)=>Promise<ActionState>;id:string;accept:string;label:string}) {
  const [state,formAction]=useActionState(action,{});
  return <form action={formAction} className="form-stack"><input type="hidden" name="id" value={id} /><label>{label}<input name="file" type="file" required accept={accept} /></label><SubmitButton pending="Uploading…">Upload file</SubmitButton>{state.error && <p className="alert danger" role="alert">{state.error}</p>}{state.success && <p className="alert success" role="status">{state.success}</p>}</form>;
}
