import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireStaff} from '../../../../lib/auth/session';
import {supabaseAdmin} from '../../../../lib/supabase/admin';
import {testResetEnabled} from '../../../../lib/test-reset';
import {BusinessForm} from '../../../../components/business-form';
import {resetTestData} from './actions';
export default async function TestData({searchParams}:{searchParams:Promise<{reset?:string}>}) {
  const {profile}=await requireStaff();if(profile.role!=='admin') notFound();
  const configured=testResetEnabled();
  const admin=configured ? supabaseAdmin() : null;
  const [control,pending]=admin ? await Promise.all([admin.from('test_reset_control').select('enabled').eq('id',1).maybeSingle(),admin.from('test_reset_jobs').select('id,created_at').is('completed_at',null).limit(1).maybeSingle()]) : [null,null];
  const ready=configured && !control?.error && !pending?.error && control?.data?.enabled===true;
  const tables=['customers','vehicles','sales','invoices','payments','supplier_invoices','supplier_payments','finance_providers'] as const;
  const counts=ready && admin ? await Promise.all(tables.map(async table=>{const result=await admin.from(table).select('*',{count:'exact',head:true});return {table,count:result.count,error:!!result.error};})) : [];
  const countError=counts.some(item=>item.error);
  return <><div className="page-heading"><div><h1>Test data reset</h1><Link className="text-link" href="/dashboard/settings">Back to settings</Link></div><span className="badge">Administrator only</span></div>
    {(await searchParams).reset && <p className="alert success" role="status">Test business records and their uploaded files were cleared. Staff accounts, permissions and company settings were kept.</p>}
    <section className="card"><h2>Testing workspace only</h2><p className="muted">This permanently removes all customers, vehicles (including archived stock), costs, sales, invoices, credits, payments, finance-provider records, supplier bills and uploaded documents in this database. Related business audit snapshots are removed. This cannot be undone from the app.</p><p className="muted">Staff logins, activation, roles, permissions, company settings, invoice number counters and reset/security audit history are kept. Invoice numbers are not reused.</p><p className="alert danger">Stop using the workspace while resetting. Disable test reset before entering real business records. Local and cloud apps may share this database.</p></section>
    {!ready ? <section className="card"><h2>Reset disabled</h2><p className="muted">The server test-mode flag, matching project reference and database test-mode switch must all be enabled. See README setup instructions. No data has been removed.</p></section> : <section className="card"><h2>{pending?.data ? 'Resume uploaded-file cleanup' : 'Reset all test business data'}</h2>{pending?.data && <p className="alert danger">A previous reset cleared database records but still has file cleanup pending. Submitting resumes that cleanup and preserves records created since that reset.</p>}<ul>{counts.map(item=><li key={item.table}>{item.table.replaceAll('_',' ')}: {item.error ? 'Unable to count' : item.count}</li>)}</ul>{countError ? <p className="alert danger">Unable to load record counts. Reset is unavailable until counts can be checked.</p> : <BusinessForm key={pending?.data?.id ?? 'new'} action={resetTestData} submit={pending?.data ? 'Resume cleanup' : 'Reset test data permanently'} fields={[{name:'request_key',type:'hidden',label:'Reset request',value:pending?.data?.id ?? randomUUID()},{name:'confirmation',label:'Type RESET TEST DATA exactly',required:true,maxLength:30},{name:'confirm',type:'checkbox',label:'I confirm this database contains only disposable test data and approve permanent removal'}]} />}</section>}
  </>;
}
