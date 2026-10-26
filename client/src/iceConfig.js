// WebRTC ICE server configuration, shared by the call engine and the supervisor monitor.
//
// STUN alone only works when both peers sit behind "friendly" NATs. Mobile carrier networks
// (very common in India) and strict office/college Wi-Fi usually need a TURN relay, otherwise
// calls connect but have no audio. Optionally configure one at BUILD time:
//
//   VITE_TURN_URL=turn:standard.relay.metered.ca:80,turns:standard.relay.metered.ca:443?transport=tcp
//   VITE_TURN_USERNAME=...
//   VITE_TURN_CREDENTIAL=...
//
// (VITE_TURN_URL may be a comma-separated list.) See DEPLOYMENT.md, "Optional: TURN".

const iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const turnUrl = import.meta.env.VITE_TURN_URL;
if (turnUrl) {
  iceServers.push({
    urls: turnUrl.split(",").map((u) => u.trim()).filter(Boolean),
    username: import.meta.env.VITE_TURN_USERNAME || "",
    credential: import.meta.env.VITE_TURN_CREDENTIAL || "",
  });
}

export const ICE_SERVERS = { iceServers };
