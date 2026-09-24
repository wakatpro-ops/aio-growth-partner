import { redirect } from "next/navigation";
import { menuContext } from "@/lib/menu-workbench";
export default async function ItemsPage({params,searchParams}:{params:Promise<{storeId:string}>;searchParams:Promise<{saved?:string;archived?:string}>}) {
  const {storeId}=await params,query=await searchParams;
  await menuContext(storeId);
  redirect(`/stores/${storeId}/inventory?tab=menu${query.saved||query.archived?"&saved=item":""}`);
}
