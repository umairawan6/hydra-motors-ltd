import React from 'react';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {Document,Page,Text,View,Image,StyleSheet,renderToBuffer} from '@react-pdf/renderer';
import {z} from 'zod';
import {money,date} from '../business/format';
const party=z.object({full_name:z.string(),address:z.string().nullable().optional(),email:z.string().nullable().optional(),phone:z.string().nullable().optional()});
export const invoiceSnapshotSchema=z.object({
  document_number:z.string(),invoice_type:z.enum(['customer','credit','finance']),issued_at:z.string(),total:z.number().nonnegative(),
  company:z.object({company_name:z.string(),address:z.string(),registration_number:z.string(),email:z.string(),phone:z.string(),payment_details:z.string(),terms:z.string()}),
  customer:party,vehicle:z.object({registration:z.string(),vin:z.string().nullable(),make:z.string(),model:z.string(),model_year:z.number().nullable(),mileage:z.number().nullable(),gearbox:z.enum(['automatic','manual']).nullable().optional()}),
  warranty_months:z.union([z.literal(3),z.literal(6),z.literal(12)]).nullable().optional(),
  list_price:z.number(),discount:z.number(),fees:z.number(),fee_description:z.string(),supply_date:z.string(),
  credit_reason:z.string().optional(),original_number:z.string().optional(),provider:party.optional(),source_number:z.string().optional(),due_date:z.string().optional(),
});
export type InvoiceSnapshot=z.infer<typeof invoiceSnapshotSchema>;

const logo=readFileSync(path.join(process.cwd(),'public/branding/hydra-logo.png'));
const styles=StyleSheet.create({
  page:{fontFamily:'Helvetica',fontSize:9,paddingTop:30,paddingHorizontal:38,paddingBottom:44,color:'#17283d'},
  header:{flexDirection:'row',justifyContent:'space-between',paddingBottom:10,marginBottom:12,borderBottomWidth:1,borderBottomColor:'#00a8c2'},
  logo:{width:150,height:48,marginBottom:5},
  tagline:{color:'#007a96',fontFamily:'Helvetica-Bold',fontSize:7.5,letterSpacing:1,marginBottom:9},
  company:{fontFamily:'Helvetica-Bold',fontSize:10,lineHeight:1.2,marginBottom:5},
  title:{fontSize:20,fontFamily:'Helvetica-Bold',lineHeight:1.15,marginBottom:10},
  number:{fontSize:12,lineHeight:1.2,fontFamily:'Helvetica-Bold',color:'#007a96',marginBottom:8},
  muted:{color:'#52616d',fontSize:8,marginBottom:4,lineHeight:1.35},
  columns:{flexDirection:'row',gap:24,borderWidth:1,borderColor:'#dbe3ea',borderRadius:6,padding:10,marginBottom:12},
  column:{flexGrow:1,flexBasis:0},
  label:{fontSize:8,fontFamily:'Helvetica-Bold',color:'#52616d',marginBottom:6},
  name:{fontFamily:'Helvetica-Bold',fontSize:11,lineHeight:1.2,marginBottom:6},
  line:{marginBottom:3,lineHeight:1.15},
  detail:{flexDirection:'row',justifyContent:'space-between',gap:8,marginBottom:5},
  detailValue:{width:'60%',textAlign:'right'},
  row:{flexDirection:'row',justifyContent:'space-between',paddingVertical:5,borderBottomWidth:1,borderBottomColor:'#dbe3ea'},
  description:{width:'72%',lineHeight:1.4},
  amount:{width:'28%',textAlign:'right'},
  total:{fontSize:17,lineHeight:1.2,fontFamily:'Helvetica-Bold',padding:10,marginTop:9,backgroundColor:'#eff7fa',borderRadius:5,borderBottomWidth:0},
  payment:{marginTop:12,padding:8,borderWidth:1,borderColor:'#dbe3ea',borderRadius:5},
  thanks:{fontFamily:'Helvetica-Bold',fontSize:10,color:'#007a96',lineHeight:1.4,marginBottom:9},
  terms:{fontSize:8,lineHeight:1.2,marginTop:12},
  signatures:{marginTop:8,flexDirection:'row',gap:28},
  signature:{flexGrow:1,flexBasis:0},
  signingSpace:{height:22,borderBottomWidth:1,borderBottomColor:'#8293a4',marginBottom:5},
  blank:{fontSize:8,color:'#52616d',marginTop:8},
  footer:{position:'absolute',bottom:22,left:38,right:38,fontSize:7,color:'#52616d',textAlign:'center'},
});
function Detail({label,value}:{label:string;value:string|number}) {
  return <View style={styles.detail}><Text>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}
export function InvoiceDocument({snapshot:s}:{snapshot:InvoiceSnapshot}) {
  const recipient=s.invoice_type==='finance' && s.provider ? s.provider : s.customer;
  const title=s.invoice_type==='credit' ? 'CREDIT NOTE' : s.invoice_type==='finance' ? 'FINANCE INVOICE' : 'VEHICLE SALE\nINVOICE';
  const termParagraphs=s.company.terms.split(/\r?\n/);
  const finalTerm=termParagraphs.at(-1) ?? '';
  return <Document title={title.replace('\n',' ')+' '+s.document_number} author={s.company.company_name} creationDate={new Date(s.issued_at)} modificationDate={new Date(s.issued_at)}>
    <Page size="A4" style={styles.page}>
      <View style={styles.header} wrap={false}>
        <View style={{width:'55%'}}>
          {/* Embedded local artwork: invoice rendering never fetches an external logo. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image primitive has no HTML alt prop. */}
          <Image src={{data:logo,format:'png'}} style={styles.logo} />
          <Text style={styles.tagline}>DRIVEN BY TRUST. DEFINED BY QUALITY.</Text>
          <Text style={styles.company}>{s.company.company_name}</Text>
          <Text style={styles.line}>{s.company.address.split(/\r?\n/).join(', ')}</Text>
          <Text style={styles.muted}>Company registration: {s.company.registration_number}</Text>
          <Text style={styles.muted}>{[s.company.phone,s.company.email].filter(Boolean).join(' | ')}</Text>
        </View>
        <View style={{width:'40%',textAlign:'right'}}>
          <Text style={styles.title} hyphenationCallback={word=>[word]}>{title}</Text>
          <Text style={styles.number}>{s.document_number}</Text>
          <Text style={styles.line}>Issued: {date(s.issued_at)}</Text>
          <Text style={styles.line}>Sale date: {date(s.supply_date)}</Text>
          {s.due_date && <Text style={styles.line}>Due: {date(s.due_date)}</Text>}
        </View>
      </View>
      <View style={styles.columns} wrap={false}>
        <View style={styles.column}>
          <Text style={styles.label}>{s.invoice_type==='finance' ? 'FINANCE PROVIDER' : 'PURCHASED BY'}</Text>
          <Text style={styles.name}>{recipient.full_name}</Text>
          <Text style={styles.line}>{recipient.address?.split(/\r?\n/).join(', ') ?? ''}</Text>
          <Text style={styles.muted}>{[recipient.phone,recipient.email].filter(Boolean).join(' | ')}</Text>
        </View>
        <View style={styles.column}>
          <Text style={styles.label}>VEHICLE DETAILS</Text>
          <Detail label="Make / model" value={s.vehicle.make+' '+s.vehicle.model} />
          <Detail label="Year" value={s.vehicle.model_year ?? 'Not recorded'} />
          <Detail label="Registration" value={s.vehicle.registration} />
          <Detail label="Chassis / VIN" value={s.vehicle.vin ?? 'Not recorded'} />
          <Detail label="Mileage" value={s.vehicle.mileage?.toLocaleString('en-GB') ?? 'Not recorded'} />
          {s.vehicle.gearbox && <Detail label="Gearbox" value={s.vehicle.gearbox==='automatic' ? 'Automatic' : 'Manual'} />}
          {s.invoice_type==='customer' && s.warranty_months && <Detail label="Warranty" value={`${s.warranty_months} months`} />}
          {s.invoice_type==='finance' && <><Text style={styles.line}>Customer: {s.customer.full_name}</Text><Text style={styles.line}>Sale invoice: {s.source_number}</Text></>}
          {s.original_number && <Text style={styles.line}>Original invoice: {s.original_number}</Text>}
        </View>
      </View>
      <View wrap={false}>
        <View style={styles.row}><Text style={styles.label}>DESCRIPTION</Text><Text style={styles.label}>AMOUNT (GBP)</Text></View>
        {s.invoice_type==='customer' ? <>
          <View style={styles.row}><Text style={styles.description}>Vehicle purchase - {s.vehicle.registration}</Text><Text style={styles.amount}>{money(s.list_price)}</Text></View>
          {s.discount>0 && <View style={styles.row}><Text style={styles.description}>Discount</Text><Text style={styles.amount}>-{money(s.discount)}</Text></View>}
          {s.fees>0 && <View style={styles.row}><Text style={styles.description}>{s.fee_description}</Text><Text style={styles.amount}>{money(s.fees)}</Text></View>}
        </> : <View style={styles.row}><Text style={styles.description}>{s.invoice_type==='credit' ? s.credit_reason : 'Finance contribution towards the linked vehicle sale. This is not an additional vehicle sale.'}</Text><Text style={styles.amount}>{money(s.total)}</Text></View>}
        <View style={[styles.row,styles.total]}><Text>{s.invoice_type==='credit' ? 'CREDIT TOTAL' : 'TOTAL'}</Text><Text>{money(s.total)}</Text></View>
      </View>
      {s.invoice_type!=='credit' && <View style={styles.payment} wrap={false}>
        <Text style={styles.label}>PAYMENT INSTRUCTIONS</Text>
        <Text style={styles.line}>{s.company.payment_details || 'Contact the dealership.'}</Text>
        <Text style={styles.muted}>Please quote {s.document_number} with your payment. Request a current statement for payments received and any balance due.</Text>
      </View>}
      <View style={styles.terms}>
        <Text style={styles.label} minPresenceAhead={40}>TERMS &amp; CONDITIONS</Text>
        <Text orphans={3} widows={3}>{s.invoice_type==='customer' ? termParagraphs.slice(0,-1).join('\n') : s.company.terms}</Text>
      </View>
      {s.invoice_type==='customer' && <View wrap={finalTerm.length>800}>
        <Text style={{fontSize:8,lineHeight:1.2,marginBottom:12}} orphans={3} widows={3}>{finalTerm}</Text>
        <View wrap={false}>
        <Text style={styles.thanks}>Thank you for choosing Hydra Motors LTD. We wish you many happy miles.</Text>
        <Text style={styles.muted}>Optional signatures - acknowledgement of the recorded sale details.</Text>
        <View style={styles.signatures}>
          {['Seller signature','Buyer signature'].map(label=><View style={styles.signature} key={label}>
            <View style={styles.signingSpace} />
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.blank}>Printed name: __________________________</Text>
            <Text style={styles.blank}>Date: _________________________________</Text>
          </View>)}
        </View>
        </View>
      </View>}
      <Text fixed style={styles.footer} render={({pageNumber,totalPages})=>s.document_number+' | '+s.company.company_name+' | Page '+pageNumber+' of '+totalPages} />
    </Page>
  </Document>;
}
export async function renderInvoice(snapshot:unknown) {const parsed=invoiceSnapshotSchema.parse(snapshot);return renderToBuffer(<InvoiceDocument snapshot={parsed} />);}
