import { StaffScanner } from "@/components/staff-scanner";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const settings = await getSettings();
  return (
    <div className="container py-6">
      <StaffScanner
        budgetRemaining={Math.max(0, settings.budgetTotal - settings.budgetUsed)}
        budgetTotal={settings.budgetTotal}
      />
    </div>
  );
}
