import { invoiceDownload } from '@/lib/procurement/invoice-export';
import { uuid } from '@/lib/procurement/model';
import { supplierView } from '@/lib/procurement/service';

export async function GET(_:Request,{params}:{params:Promise<{supplierId:string;orderId:string;invoiceId:string}>}) {
  const {supplierId,orderId,invoiceId}=await params;
  if(!uuid(orderId)||!uuid(invoiceId)) return new Response(null,{status:404});
  const view=await supplierView(supplierId,orderId,0,false);
  const invoice=view?.invoices.find(row=>row.id===invoiceId);
  return invoice ? invoiceDownload(invoice) : new Response(null,{status:404});
}
