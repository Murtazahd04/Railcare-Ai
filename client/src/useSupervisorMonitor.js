import { useEffect, useRef, useState, useCallback } from "react";

import { ICE_SERVERS } from "./iceConfig";

/**
 * useSupervisorMonitor(socket)
 * Lets a supervisor "join" (listen only, no mic sent) any executive's live
 * call. The executive's browser does the actual audio mixing and offers a
 * dedicated connection — see the `monitor:*` handling in useCallEngine.js.
 */
export function useSupervisorMonitor(socket) {
  const [monitoringExecutiveId, setMonitoringExecutiveId] = useState(null);
  const pcRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    const onOffer = async ({ fromId, sdp }) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      pc.ontrack = (event) => {
        if (audioRef.current) audioRef.current.srcObject = event.streams[0];
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("monitor:ice-candidate", { targetId: fromId, candidate: event.candidate });
        }
      };
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("monitor:answer", { targetId: fromId, sdp: answer });
    };
    const onIce = async ({ candidate }) => {
      if (pcRef.current && candidate) {
        try { await pcRef.current.addIceCandidate(candidate); } catch { /* ignore */ }
      }
    };
    const onActionFailed = ({ reason }) => {
      setMonitoringExecutiveId(null);
      // eslint-disable-next-line no-alert
      console.warn("[supervisor] action failed:", reason);
    };

    socket.on("monitor:offer", onOffer);
    socket.on("monitor:ice-candidate", onIce);
    socket.on("supervisor:action-failed", onActionFailed);

    return () => {
      socket.off("monitor:offer", onOffer);
      socket.off("monitor:ice-candidate", onIce);
      socket.off("supervisor:action-failed", onActionFailed);
    };
  }, [socket]);

  const startMonitoring = useCallback((executiveSocketId) => {
    setMonitoringExecutiveId(executiveSocketId);
    socket.emit("supervisor:monitor", { executiveSocketId });
  }, [socket]);

  const stopMonitoring = useCallback(() => {
    if (monitoringExecutiveId) socket.emit("monitor:stop", { executiveSocketId: monitoringExecutiveId });
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (audioRef.current) audioRef.current.srcObject = null;
    setMonitoringExecutiveId(null);
  }, [socket, monitoringExecutiveId]);

  const forceTransfer = useCallback((executiveSocketId, targetExecutiveId) => {
    socket.emit("supervisor:force-transfer", { executiveSocketId, targetExecutiveId });
  }, [socket]);

  return { monitoringExecutiveId, audioRef, startMonitoring, stopMonitoring, forceTransfer };
}
