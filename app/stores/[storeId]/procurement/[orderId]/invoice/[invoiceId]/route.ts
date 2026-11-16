import { invoiceDownload } from '@/lib/procurement/invoice-export';
import { uuid } from '@/lib/procurement/model';
import { buyerOrder, buyerOrderEvidence } from '@/lib/procurement/service';

export async function GET(_:Request,{params}:{params:Promise<{storeId:string;orderId:string;invoiceId:string}>}) {
  const {storeId,orderId,invoiceId}=await params;
  if(!uuid(invoiceId)||!await buyerOrder(storeId,orderId)) return new Response(null,{status:404});
  const {invoices}=await buyerOrderEvidence(storeId,orderId);
  const invoice=invoices.find(row=>row.id===invoiceId);
  return invoice ? invoiceDownload(invoice) : new Response(null,{status:404});
}
