"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm("確定要刪除這個 skill？")) return;
    setBusy(true);
    const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard");
    } else {
      alert("刪除失敗");
      setBusy(false);
    }
  }

  return (
    <Button variant="destructive" size="sm" disabled={busy} onClick={onDelete}>
      {busy ? "刪除中…" : "刪除"}
    </Button>
  );
}
