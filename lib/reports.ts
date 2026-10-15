import {z} from 'zod';
import {todayLondon} from './business/format';
const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const parsed=new Date(value+'T12:00:00Z');return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10)===value;});
export function reportRange(params:{from?:string;to?:string}) {
  const today=todayLondon();
  const from=isoDate.parse(params.from ?? today.slice(0,4)+'-01-01');
  const to=isoDate.parse(params.to ?? today);
  if(from>to || from<'2000-01-01' || to>'2100-12-31' || (Date.parse(to)-Date.parse(from))/86400000>3660) throw new Error('Choose a valid date range of up to ten years.');
  return {from,to};
}
const metrics=z.object({sales_count:z.number(),gross:z.number(),credits:z.number(),revenue:z.number(),cash:z.number(),cost:z.number().optional(),overhead:z.number().optional(),missing_costs:z.number().optional(),profit:z.number().nullable().optional()});
export const reportSchema=z.object({generated_at:z.string(),start_date:z.string(),end_date:z.string(),profit_allowed:z.boolean(),outstanding:z.number(),refundable:z.number(),undated_sales:z.number(),summary:metrics,months:z.array(metrics.extend({month:z.string()}))});
export type SalesReport=z.infer<typeof reportSchema>;
export function reportCsv(report:SalesReport) {
  const headers=['Month','Invoices issued','Gross sales GBP','Credits GBP','Net sales GBP','Net receipts GBP'];
  if(report.profit_allowed) headers.push('Vehicle costs GBP','Overhead GBP','Missing cost adjustments','Trading profit GBP');
  const rows=report.months.map(m=>{const row:(string|number)[]=[m.month,m.sales_count,m.gross,m.credits,m.revenue,m.cash];if(report.profit_allowed) row.push(m.cost ?? '',m.overhead ?? '',m.missing_costs ?? '',m.profit ?? 'Incomplete costs');return row;});
  return '\uFEFF'+[headers,...rows].map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
}
