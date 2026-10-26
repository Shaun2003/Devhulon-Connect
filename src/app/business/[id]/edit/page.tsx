import type { Metadata } from "next";
import EditBusinessForm from "@/components/EditBusinessForm";

// Owner-only tooling — never index it.
export const metadata: Metadata = {
  title: "Edit your listing",
  robots: { index: false, follow: false },
};

export default async function EditBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditBusinessForm id={id} />;
}