import {requireStaff} from '../../../../lib/auth/session';
import {reportRange,reportSchema,reportCsv} from '../../../../lib/reports';
export async function GET(request:Request) {
  const {db}=await requireStaff('reports.sales');
  const params=new URL(request.url).searchParams;
  let range;try {range=reportRange({from:params.get('from') ?? undefined,to:params.get('to') ?? undefined});} catch {return new Response('Invalid report date range.',{status:400});}
  const {data,error}=await db.rpc('sales_profit_report',{start_date:range.from,end_date:range.to});
  const parsed=reportSchema.safeParse(data);
  if(error || !parsed.success) return new Response('Report unavailable.',{status:503,headers:{'Cache-Control':'private, no-store'}});
  return new Response(reportCsv(parsed.data),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="hydra-monthly-${range.from}-${range.to}.csv"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
