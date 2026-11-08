"use client";
import Link from "next/link";
import { History, Workflow } from "lucide-react";
import { PageHeader, Button } from "@/components/ui";
import { Executions } from "@/components/automations/executions";

export default function AutomationRunsPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<History className="h-4 w-4" />} title="Executions"
        actions={<Link href="/automations"><Button icon={<Workflow className="h-3.5 w-3.5" />}>All automations</Button></Link>} />
      <div className="min-h-0 flex-1"><Executions showAutomation /></div>
    </div>
  );
}
