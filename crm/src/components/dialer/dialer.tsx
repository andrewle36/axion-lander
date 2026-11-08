"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Pause, Play, Grid3x3, X, Minimize2, PhoneIncoming, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { cn, fmtPhone, toE164 } from "@/lib/utils";
import { Button, IconButton, Textarea, Portal } from "@/components/ui";

type Target = { number: string; contactId?: string | null; companyId?: string | null; name?: string | null };
type Ctx = { call: (t: Target) => void; open: () => void; state: string };
const DialerCtx = createContext<Ctx>({ call: () => {}, open: () => {}, state: "idle" });
export const useDialer = () => useContext(DialerCtx);

/* eslint-disable @typescript-eslint/no-explicit-any */
export function DialerProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [min, setMin] = useState(false);
  const [state, setState] = useState<string>("idle");
  const [target, setTarget] = useState<Target | null>(null);
  const [incoming, setIncoming] = useState<any>(null);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [pad, setPad] = useState(false);
  const [number, setNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [ready, setReady] = useState(false);
  const client = useRef<any>(null);
  const callRef = useRef<any>(null);
  const callRow = useRef<string | null>(null);
  const startedAt = useRef<number | null>(null);

  const tokenQ = trpc.comms.dialerToken.useMutation({ meta: { silent: true, keepCache: true } });
  const logStart = trpc.comms.logCallStart.useMutation({ meta: { keepCache: true } });
  const logEnd = trpc.comms.logCallEnd.useMutation();
  const lookup = trpc.comms.lookupNumber.useMutation({ meta: { keepCache: true, silent: true } });

  const connect = useCallback(async () => {
    if (client.current) return client.current;
    const { token, callerNumber } = await tokenQ.mutateAsync();
    const { TelnyxRTC } = await import("@telnyx/webrtc");
    const c = new TelnyxRTC({ login_token: token });
    (c as any).callerNumber = callerNumber;
    c.remoteElement = "telnyx-remote-audio";
    c.on("telnyx.ready", () => setReady(true));
    c.on("telnyx.error", (e: any) => toast.error(`Dialer: ${e?.error?.message ?? "connection error"}`));
    c.on("telnyx.socket.close", () => { setReady(false); client.current = null; });
    c.on("telnyx.notification", (n: any) => {
      if (n.type !== "callUpdate") return;
      const call = n.call;
      if (call.direction === "inbound" && call.state === "ringing") {
        setIncoming(call); setVisible(true); setMin(false);
        const from = call.options?.remoteCallerNumber ?? "";
        setTarget({ number: from, name: call.options?.remoteCallerName });
        lookup.mutateAsync({ number: from }).then((r) => r && setTarget({ number: from, contactId: r.id, companyId: r.company_id, name: r.name })).catch(() => {});
      }
      callRef.current = call;
      setState(call.state);
      if (call.state === "active" && !startedAt.current) startedAt.current = Date.now();
      if (["hangup", "destroy"].includes(call.state)) finish();
    });
    c.connect();
    client.current = c;
    return c;
  }, [tokenQ, lookup]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (visible && !client.current) connect().catch((e) => toast.error(e.message)); }, [visible, connect]);
  useEffect(() => {
    if (!startedAt.current || state !== "active") return;
    const t = setInterval(() => setSeconds(Math.round((Date.now() - (startedAt.current ?? Date.now())) / 1000)), 1000);
    return () => clearInterval(t);
  }, [state]);

  const finish = () => {
    const dur = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0;
    if (callRow.current) logEnd.mutate({ id: callRow.current, duration_sec: dur, status: dur > 0 ? "completed" : "no_answer", notes });
    callRow.current = null; startedAt.current = null; callRef.current = null;
    setIncoming(null); setMuted(false); setHeld(false); setState("idle"); setSeconds(0);
  };

  const dial = async (t: Target) => {
    const to = toE164(t.number);
    if (!to) return toast.error("Enter a valid phone number");
    setTarget(t); setVisible(true); setMin(false); setNotes(""); setState("connecting");
    try {
      const c = await connect();
      if (!ready) await new Promise((r) => setTimeout(r, 1200));
      const row = await logStart.mutateAsync({ to, contact_id: t.contactId ?? null, company_id: t.companyId ?? null, direction: "out" });
      callRow.current = row.id;
      callRef.current = c.newCall({ destinationNumber: to, callerNumber: c.callerNumber, audio: true, video: false, clientState: btoa(row.id) });
    } catch (e) { setState("idle"); toast.error((e as Error).message); }
  };

  const answer = async () => {
    if (!incoming) return;
    const row = await logStart.mutateAsync({ to: target?.number ?? "", contact_id: target?.contactId ?? null, company_id: target?.companyId ?? null, direction: "in" });
    callRow.current = row.id; incoming.answer(); setIncoming(null);
  };
  const hangup = () => { try { callRef.current?.hangup(); } catch {} finish(); };
  const toggleMute = () => { if (!callRef.current) return; muted ? callRef.current.unmuteAudio() : callRef.current.muteAudio(); setMuted(!muted); };
  const toggleHold = () => { if (!callRef.current) return; held ? callRef.current.unhold() : callRef.current.hold(); setHeld(!held); };
  const dtmf = (d: string) => { callRef.current?.dtmf(d); setNumber((n) => n + d); };
  const inCall = !["idle"].includes(state);
  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <DialerCtx.Provider value={{ call: dial, open: () => { setVisible(true); setMin(false); }, state }}>
      {children}
      <audio id="telnyx-remote-audio" autoPlay hidden />
      {!visible && (
        <button onClick={() => setVisible(true)} title="Open dialer"
          className="fixed bottom-4 left-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-pop hover:bg-accent/90 md:left-auto md:right-4">
          <Phone className="h-4 w-4" />
        </button>
      )}
      {visible && (
        <Portal>
          <div className={cn("fixed bottom-4 right-4 z-40 w-[300px] rounded-lg border border-border bg-bg shadow-pop", min && "w-[220px]")}>
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <span className={cn("h-2 w-2 rounded-full", ready ? "bg-success" : "bg-faint")} title={ready ? "Connected to Telnyx" : "Connecting…"} />
              <span className="flex-1 truncate text-sm font-medium">{inCall ? (target?.name || fmtPhone(target?.number)) : "Dialer"}</span>
              {inCall && <span className="text-xs tabular-nums text-muted">{state === "active" ? mmss : state}</span>}
              <IconButton label="Minimize" onClick={() => setMin(!min)}><Minimize2 className="h-3.5 w-3.5" /></IconButton>
              {!inCall && <IconButton label="Close" onClick={() => setVisible(false)}><X className="h-3.5 w-3.5" /></IconButton>}
            </div>
            {!min && (
              <div className="space-y-3 p-3">
                {incoming && (
                  <div className="flex items-center gap-2 rounded bg-accent-soft p-2 text-sm">
                    <PhoneIncoming className="h-4 w-4 text-accent" /><span className="flex-1 truncate">Incoming: {target?.name || fmtPhone(target?.number)}</span>
                    <Button size="xs" variant="primary" onClick={answer}>Answer</Button>
                    <Button size="xs" variant="danger" onClick={() => { incoming.hangup(); setIncoming(null); setState("idle"); }}>Decline</Button>
                  </div>
                )}
                {!inCall ? (
                  <>
                    <input value={number} onChange={(e) => setNumber(e.target.value)} onKeyDown={(e) => e.key === "Enter" && dial({ number })}
                      placeholder="(714) 555-0100" className="h-10 w-full rounded border border-border px-3 text-center text-lg tracking-wide outline-none focus:border-accent" />
                    <Keypad onPress={(d) => setNumber((n) => n + d)} />
                    <Button variant="primary" className="w-full" icon={<Phone className="h-4 w-4" />} onClick={() => dial({ number })} disabled={!number}>Call</Button>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      <CtlBtn label={muted ? "Unmute" : "Mute"} active={muted} onClick={toggleMute}>{muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</CtlBtn>
                      <CtlBtn label={held ? "Resume" : "Hold"} active={held} onClick={toggleHold}>{held ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</CtlBtn>
                      <CtlBtn label="Keypad" active={pad} onClick={() => setPad(!pad)}><Grid3x3 className="h-4 w-4" /></CtlBtn>
                      <CtlBtn label="Hang up" danger onClick={hangup}><PhoneOff className="h-4 w-4" /></CtlBtn>
                    </div>
                    {pad && <Keypad onPress={dtmf} />}
                    <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Call notes (saved to the timeline; AI summarizes them)" />
                    <div className="flex items-center gap-1 text-xs text-faint"><Sparkles className="h-3 w-3" /> Notes are summarized by AI after the call.</div>
                  </>
                )}
              </div>
            )}
          </div>
        </Portal>
      )}
    </DialerCtx.Provider>
  );
}
function Keypad({ onPress }: { onPress: (d: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {"123456789*0#".split("").map((d) => (
        <button key={d} onClick={() => onPress(d)} className="h-9 rounded bg-subtle text-base font-medium hover:bg-hover">{d}</button>
      ))}
    </div>
  );
}
function CtlBtn({ children, label, onClick, active, danger }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} title={label} className={cn("flex h-11 flex-col items-center justify-center gap-0.5 rounded text-[10px]",
      danger ? "bg-danger text-white hover:bg-danger/90" : active ? "bg-accent text-white" : "bg-subtle text-fg hover:bg-hover")}>
      {children}{label}
    </button>
  );
}
