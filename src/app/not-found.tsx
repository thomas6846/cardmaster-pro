import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">404 — 找不到頁面</h1>
      <p className="text-sm text-muted-foreground">
        連結可能已失效或交易已刪除。
      </p>
      <Link href="/">
        <Button>回首頁</Button>
      </Link>
    </div>
  );
}
