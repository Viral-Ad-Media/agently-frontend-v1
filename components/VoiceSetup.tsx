import React,{useEffect,useRef,useState} from "react";
import {useWebcall} from "../contexts/WebcallContext";
export default function VoiceSetup() {
  const {voiceSettings,setVoiceSettings,isCallLive}=useWebcall();
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[level,setLevel]=useState(0),[error,setError]=useState(""),[checking,setChecking]=useState(false);
  const cleanup=useRef<()=>void>(()=>{});
  useEffect(()=>()=>cleanup.current(),[]);
  if(!voiceSettings) return null;
  async function check() {
    cleanup.current();setError("");
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:voiceSettings.deviceId ? {exact:voiceSettings.deviceId} : undefined,echoCancellation:true,noiseSuppression:true}});
      const context=new AudioContext(),analyser=context.createAnalyser();
      context.createMediaStreamSource(stream).connect(analyser);
      const samples=new Float32Array(analyser.fftSize);
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="audioinput"));setChecking(true);
      const timer=setInterval(()=>{analyser.getFloatTimeDomainData(samples);setLevel(Math.min(1,Math.sqrt(samples.reduce((n,v)=>n+v*v,0)/samples.length)*5));},100);
      let expiry:ReturnType<typeof setTimeout>;
      cleanup.current=()=>{clearInterval(timer);clearTimeout(expiry);stream.getTracks().forEach(t=>t.stop());void context.close();setChecking(false);setLevel(0);};
      expiry=setTimeout(()=>cleanup.current(),10000);
    }catch(e){setError(e instanceof Error ? e.message : "Microphone check failed.");}
  }
  return <details className="rounded-xl border border-[var(--line)] p-3 text-sm"><summary className="cursor-pointer font-medium">Microphone & voice controls</summary><div className="mt-3 space-y-3">
    <p className="text-xs text-[var(--muted)]">Check your microphone for 10 seconds. This check stays on your device.</p>
    <button type="button" disabled={isCallLive} onClick={()=>checking ? cleanup.current() : void check()} className="rounded border px-3 py-2">{checking ? "Stop check" : "Check microphone"}</button>
    <label className="block">Microphone<select aria-label="Microphone" disabled={isCallLive || checking} value={voiceSettings.deviceId} onChange={e=>setVoiceSettings({deviceId:e.target.value})} className="mt-1 block w-full rounded border p-2"><option value="">System default</option>{devices.filter(d=>d.deviceId!=="default").map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i+1}`}</option>)}</select></label>
    <meter aria-label="Microphone input level" min={0} max={1} value={level} className="w-full"/>
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
      <p className="font-medium text-emerald-900">Hands-free conversation</p>
      <p className="mt-1 text-xs leading-5 text-emerald-800">Speak naturally without holding a button. The agent detects when you start and finish talking, and the call controls still let you mute the microphone when needed.</p>
    </div>
    <p className="text-xs text-[var(--muted)]">Echo cancellation, automatic gain, browser noise filtering, and far-field voice filtering are enabled during calls.</p>
    {error && <p role="alert">{error}</p>}
  </div></details>;
}
