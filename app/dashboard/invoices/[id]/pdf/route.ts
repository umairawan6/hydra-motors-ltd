import {z} from 'zod';
import {requireStaff} from '../../../../../lib/auth/session';
import {supabaseAdmin} from '../../../../../lib/supabase/admin';
import {renderInvoice} from '../../../../../lib/invoices/document';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {db}=await requireStaff();const {id}=await params;if(!z.uuid().safeParse(id).success) return new Response('Not found',{status:404});
  const {data:invoice,error}=await db.from('invoices').select('id,sale_id,document_number,document_path,snapshot').eq('id',id).maybeSingle();if(error || !invoice) return new Response('Not found',{status:404});if(!invoice.snapshot) return new Response('This legacy invoice has no immutable snapshot. Retain the original document.',{status:409});
  const path=`${invoice.sale_id}/${id}.pdf`;const headers={'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${invoice.document_number?.replace(/[^A-Za-z0-9_-]/g,'') || id}.pdf"`,'Cache-Control':'private, no-store'};
  if(invoice.document_path) {const stored=await db.storage.from('invoice-pdfs').download(path);if(stored.data && !stored.error) return new Response(new Uint8Array(await stored.data.arrayBuffer()),{headers});}
  if(!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return new Response('PDF storage requires a server-only Supabase secret key. See README.',{status:503});
  try {const bytes=await renderInvoice(invoice.snapshot);const admin=supabaseAdmin();const uploaded=await admin.storage.from('invoice-pdfs').upload(path,bytes,{contentType:'application/pdf',upsert:false});
    if(uploaded.error) {const existing=await admin.storage.from('invoice-pdfs').download(path);if(!existing.data || existing.error) throw new Error('Unable to store PDF');const marked=await db.rpc('set_invoice_pdf',{target:id,pdf_state:'ready'});if(marked.error) throw new Error('Unable to finalize PDF');return new Response(new Uint8Array(await existing.data.arrayBuffer()),{headers});}
    const marked=await db.rpc('set_invoice_pdf',{target:id,pdf_state:'ready'});if(marked.error) throw new Error('Unable to finalize PDF');return new Response(new Uint8Array(bytes),{headers});
  } catch {await db.rpc('set_invoice_pdf',{target:id,pdf_state:'failed'});return new Response('PDF generation failed. Retry this link; the invoice will not be reissued or renumbered.',{status:503});}
}
