import { redirect } from "next/navigation";

export default async function AcquisitionHubPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  redirect(`/stores/${storeId}/settings`);
}
