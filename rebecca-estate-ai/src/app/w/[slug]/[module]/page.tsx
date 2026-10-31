import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CURRENT_PHASE, moduleByKey } from "@/lib/modules";

/** 尚未開放的模組：只顯示規劃與開放階段，不放任何假按鈕 */
export default async function ModulePlaceholder({ params }: { params: Promise<{ slug: string; module: string }> }) {
  const { module } = await params;
  const mod = moduleByKey(module);
  if (!mod || mod.phase <= CURRENT_PHASE) notFound();
  const Icon = mod.icon;

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-primary">
        <Icon className="size-6 text-accent" /> {mod.label}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            此模組尚未開放 <Badge variant="gold">預計 Phase {mod.phase}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed">
          <p>{mod.summary}</p>
          <p className="text-muted-foreground">資料表與權限規則已在資料庫建立完成；操作介面將於該階段上線，目前此頁不提供任何操作。</p>
        </CardContent>
      </Card>
    </div>
  );
}
