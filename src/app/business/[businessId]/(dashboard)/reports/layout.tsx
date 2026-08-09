import ReportsSubnav from "./reports-subnav";

export default async function ReportsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  return (
    <div>
      <ReportsSubnav businessId={businessId} />
      {children}
    </div>
  );
}
