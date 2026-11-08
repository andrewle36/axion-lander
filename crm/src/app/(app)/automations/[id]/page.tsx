"use client";
import { useParams } from "next/navigation";
import { AutomationEditor } from "@/components/automations/editor";

export default function AutomationEditorPage() {
  const { id } = useParams<{ id: string }>();
  return <AutomationEditor key={id} id={id} />;
}
