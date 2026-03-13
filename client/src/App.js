import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import "./App.css";

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:3001";

function loadProfile() {
  try {
    const raw = localStorage.getItem("typing-race-profile");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveProfile(profile) {
  localStorage.setItem("typing-race-profile", JSON.stringify(profile));
}

function defaultProfile(name) {
  return { name, badges: [], pb: 0, totalWpm: 0, raceCount: 0 };
}

function getBadge(wpm) {
  if (wpm >= 150) return { label: "TRANSCENDENT", emoji: "👁️", color: "#ff00ff" };
  if (wpm >= 120) return { label: "LIGHTNING",    emoji: "⚡", color: "#ffdd00" };
  if (wpm >= 100) return { label: "HYPERSONIC",   emoji: "🚀", color: "#00ffcc" };
  if (wpm >= 80)  return { label: "BLAZING",      emoji: "🔥", color: "#ff6600" };
  if (wpm >= 60)  return { label: "SPEEDY",       emoji: "💨", color: "#4488ff" };
  if (wpm >= 40)  return { label: "CRUISING",     emoji: "🏎️", color: "#44ff88" };
  if (wpm >= 20)  return { label: "WARMING UP",   emoji: "🌱", color: "#aaffaa" };
  return           { label: "ROOKIE",             emoji: "🐢", color: "#aaaaaa" };
}

function getPositionLabel(pos) {
  if (pos === 1) return "🥇 1st";
  if (pos === 2) return "🥈 2nd";
  if (pos === 3) return "🥉 3rd";
  return `${pos}th`;
}

function updateProfile(profile, wpm) {
  const badge = getBadge(wpm);
  const newBadges = profile.badges.includes(badge.label)
    ? profile.badges
    : [...profile.badges, badge.label];
  const newProfile = {
    ...profile,
    pb: Math.max(profile.pb, wpm),
    totalWpm: profile.totalWpm + wpm,
    raceCount: profile.raceCount + 1,
    badges: newBadges,
  };
  saveProfile(newProfile);
  return newProfile;
}

export default function App() {
  const [profile, setProfile] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [screen, setScreen] = useState("home");
  const [roomId, setRoomId] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [roomData, setRoomData] = useState(null);
  const [typed, setTyped] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const socketRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const p = loadProfile();
    setProfile(p);
  }, []);

  useEffect(() => {
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on("room_created", ({ roomId }) => {
      setRoomId(roomId); setIsHost(true); setScreen("lobby");
    });
    socket.on("room_joined", ({ roomId }) => {
      setRoomId(roomId); setIsHost(false); setScreen("lobby");
    });
    socket.on("room_update", (data) => {
      setRoomData(data);
      setScreen(prev => {
        if (data.status === "racing" && prev !== "race") {
          setTyped("");
          setTimeout(() => inputRef.current?.focus(), 100);
          return "race";
        }
        if (data.status === "finished") return "results";
        if (data.status === "waiting" && prev === "results") { setTyped(""); return "lobby"; }
        return prev;
      });
    });
    socket.on("error", ({ message }) => {
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(""), 3000);
    });
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (screen === "results" && roomData && profile) {
      const myResult = roomData.results?.find(r => r.id === socketRef.current?.id);
      if (myResult && myResult.wpm > 0) {
        setProfile(prev => updateProfile(prev, myResult.wpm));
      }
    }
    // eslint-disable-next-line
  }, [screen]);

  const createAccount = () => {
    if (!nameInput.trim()) { setErrorMsg("Enter a username!"); return; }
    const p = defaultProfile(nameInput.trim());
    saveProfile(p); setProfile(p); setErrorMsg("");
  };

  const createRoom = () => socketRef.current.emit("create_room", { playerName: profile.name, avgWpm });
  const joinRoom = () => {
    if (!joinRoomId.trim()) { setErrorMsg("Enter a room code!"); return; }
    socketRef.current.emit("join_room", { roomId: joinRoomId.toUpperCase(), playerName: profile.name });
  };
  const startRace = () => socketRef.current.emit("start_race");
  const addBot = () => socketRef.current.emit("add_bot");
  const removeBot = (botId) => socketRef.current.emit("remove_bot", { botId });
  const playAgain = () => socketRef.current.emit("play_again");

  const handleTyping = useCallback((e) => {
    const val = e.target.value;
    setTyped(val);
    socketRef.current.emit("typing_update", { typed: val });
  }, []);

  const myPlayer = roomData?.players?.find(p => p.id === socketRef.current?.id);
  const prompt = roomData?.prompt || "";
  const avgWpm = profile?.raceCount > 0 ? Math.round(profile.totalWpm / profile.raceCount) : 0;

  const renderPrompt = () => prompt.split("").map((char, i) => {
    let cls = "char-pending";
    if (i < typed.length) cls = typed[i] === char ? "char-correct" : "char-wrong";
    else if (i === typed.length) cls = "char-cursor";
    return <span key={i} className={cls}>{char}</span>;
  });

  const ProfileOverlay = () => (
    <div className="profile-overlay" onClick={() => setShowProfile(false)}>
      <div className="profile-card" onClick={e => e.stopPropagation()}>
        <div className="profile-avatar">{profile.name[0].toUpperCase()}</div>
        <div className="profile-name">{profile.name}</div>
        <div className="profile-stats">
          <div className="stat-box"><span className="stat-value">{profile.pb}</span><span className="stat-label">PB WPM</span></div>
          <div className="stat-box"><span className="stat-value">{avgWpm}</span><span className="stat-label">AVG WPM</span></div>
          <div className="stat-box"><span className="stat-value">{profile.raceCount}</span><span className="stat-label">RACES</span></div>
        </div>
        <div className="profile-badges-title">BADGE COLLECTION</div>
        <div className="profile-badges">
          {profile.badges.length === 0 && <div className="no-badges">race to earn badges!</div>}
          {profile.badges.map(label => {
            const wpmMap = { TRANSCENDENT: 150, LIGHTNING: 120, HYPERSONIC: 100, BLAZING: 80, SPEEDY: 60, CRUISING: 40, "WARMING UP": 20, ROOKIE: 0 };
            const b = getBadge(wpmMap[label] ?? 0);
            return <div key={label} className="badge-pill" style={{ borderColor: b.color, color: b.color }}>{b.emoji} {b.label}</div>;
          })}
        </div>
        <button className="btn btn-secondary" style={{marginTop:"1rem"}} onClick={() => setShowProfile(false)}>Close</button>
      </div>
    </div>
  );

  // FIRST VISIT
  if (profile === null) return (
    <div className="screen home-screen">
      <div className="home-bg" />
      <div className="home-content">
        <div className="logo-area">
          <div className="logo-title">TYPING<br/>RACE</div>
          <div className="logo-xd">XD</div>
        </div>
        <div className="tagline">create your racer profile</div>
        <div className="home-form">
          <input className="text-input" placeholder="choose a username..." value={nameInput}
            onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && createAccount()} maxLength={20} autoFocus />
          <button className="btn btn-primary" onClick={createAccount}>🏁 Create Profile</button>
          {errorMsg && <div className="error-msg">{errorMsg}</div>}
        </div>
      </div>
    </div>
  );

  // HOME
  if (screen === "home") return (
    <div className="screen home-screen">
      <div className="home-bg" />
      {showProfile && <ProfileOverlay />}
      <button className="profile-btn" onClick={() => setShowProfile(true)}>
        <span className="profile-btn-avatar">{profile.name[0].toUpperCase()}</span>
        <span className="profile-btn-name">{profile.name}</span>
        {profile.pb > 0 && <span className="profile-btn-pb">PB: {profile.pb}</span>}
      </button>
      <div className="home-content">
        <div className="logo-area">
          <div className="logo-title">TYPING<br/>RACE</div>
          <div className="logo-xd">XD</div>
        </div>
        <div className="tagline">how fast are your fingers?</div>
        <div className="home-form">
          <button className="btn btn-primary" onClick={createRoom}>🏎️ Create Room</button>
          <div className="divider">or join existing</div>
          <div className="join-row">
            <input className="text-input room-input" placeholder="room code..." value={joinRoomId}
              onChange={e => setJoinRoomId(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && joinRoom()} maxLength={6} />
            <button className="btn btn-secondary" onClick={joinRoom}>Join</button>
          </div>
          {errorMsg && <div className="error-msg">{errorMsg}</div>}
        </div>
      </div>
    </div>
  );

  // LOBBY
  if (screen === "lobby") return (
    <div className="screen lobby-screen">
      <div className="lobby-header">
        <div className="room-code-display">
          <span className="room-label">room code</span>
          <span className="room-code">{roomId}</span>
          <button className="copy-btn" onClick={() => navigator.clipboard.writeText(roomId)}>copy</button>
        </div>
      </div>
      <div className="lobby-content">
        <h2 className="lobby-title">Waiting for racers...</h2>
        <div className="player-list">
          {roomData?.players?.map(p => (
            <div key={p.id} className="player-card">
              <span className="player-avatar">{p.isBot ? "🤖" : p.name[0].toUpperCase()}</span>
              <span className="player-name">{p.name}</span>
              {p.isHost && <span className="host-badge">HOST</span>}
              {p.isBot && isHost && (
                <button className="remove-bot-btn" onClick={() => removeBot(p.id)}>✕</button>
              )}
            </div>
          ))}
        </div>
        {isHost ? (
          <div className="start-area">
            {roomData?.players?.length < 2 && <p className="waiting-hint">add a bot or share the room code!</p>}
            <div className="bot-controls">
              <button className="btn btn-secondary" onClick={addBot}
                disabled={Object.values(roomData?.players || {}).filter(p => p.isBot).length >= 3}>
                🤖 Add Bot
              </button>
              <span className="bot-hint">bots match your avg WPM ({avgWpm || "?"} wpm)</span>
            </div>
            <button className="btn btn-primary btn-large" onClick={startRace} disabled={roomData?.players?.length < 2}>🚦 Start Race!</button>
          </div>
        ) : <p className="waiting-hint">waiting for host to start the race...</p>}
        {errorMsg && <div className="error-msg">{errorMsg}</div>}
      </div>
    </div>
  );

  // RACE
  if (screen === "race" || (roomData?.status === "countdown" && screen === "lobby")) return (
    <div className="screen race-screen">
      {roomData?.status === "countdown" && (
        <div className="countdown-overlay">
          <div className="countdown-number">{roomData.countdown}</div>
          <div className="countdown-label">GET READY</div>
        </div>
      )}
      <div className="race-header">
        <div className="wpm-display">
          <span className="wpm-number">{myPlayer?.wpm || 0}</span>
          <span className="wpm-label">WPM</span>
        </div>
        <div className="race-title">TYPING RACE XD</div>
        <div className="wpm-display">
          <span className="wpm-number">{myPlayer?.progress || 0}%</span>
          <span className="wpm-label">DONE</span>
        </div>
      </div>
      <div className="progress-bars">
        {roomData?.players?.map((p, i) => (
          <div key={p.id} className="progress-row">
            <span className="progress-name">{p.name}</span>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${p.progress}%`, background: `hsl(${i * 60}, 80%, 55%)` }} />
              <span className="progress-car" style={{ left: `${p.progress}%` }}>🏎️</span>
            </div>
            <span className="progress-wpm">{p.wpm} wpm</span>
          </div>
        ))}
      </div>
      <div className="typing-area">
        <div className="prompt-display">{renderPrompt()}</div>
        <textarea ref={inputRef} className="typing-input" value={typed} onChange={handleTyping}
          disabled={myPlayer?.finished || roomData?.status !== "racing"}
          placeholder={roomData?.status === "countdown" ? "get ready..." : "start typing!"}
          spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" />
      </div>
      {myPlayer?.finished && (
        <div className="finished-banner">✅ You finished! {getPositionLabel(myPlayer.finishPosition)} — waiting for others...</div>
      )}
    </div>
  );

  // RESULTS
  if (screen === "results") {
    const sorted = [...(roomData?.results || [])].sort((a, b) => a.position - b.position);
    const myResult = sorted.find(r => r.id === socketRef.current?.id);
    const badge = myResult ? getBadge(myResult.wpm) : null;
    const isNewPB = myResult && myResult.wpm >= profile.pb && profile.raceCount > 0;

    return (
      <div className="screen results-screen">
        <div className="results-title">RACE OVER!</div>
        {badge && (
          <div className="badge-display" style={{ borderColor: badge.color, boxShadow: `0 0 30px ${badge.color}44` }}>
            <div className="badge-emoji">{badge.emoji}</div>
            <div className="badge-label" style={{ color: badge.color }}>{badge.label}</div>
            <div className="badge-wpm">{myResult.wpm} WPM</div>
            {isNewPB && <div className="pb-banner">🎉 NEW PERSONAL BEST!</div>}
          </div>
        )}
        <div className="podium">
          {sorted.map(r => {
            const b = getBadge(r.wpm);
            return (
              <div key={r.id} className={`result-row ${r.position === 1 ? "result-winner" : ""}`}>
                <span className="result-pos">{getPositionLabel(r.position)}</span>
                <span className="result-name">{r.name}</span>
                <span className="result-wpm" style={{ color: b.color }}>{r.wpm} wpm</span>
                <span className="result-badge">{b.emoji} {b.label}</span>
              </div>
            );
          })}
        </div>
        <div className="results-stats">
          <div className="stat-box"><span className="stat-value">{profile.pb}</span><span className="stat-label">PB</span></div>
          <div className="stat-box"><span className="stat-value">{avgWpm}</span><span className="stat-label">AVG</span></div>
          <div className="stat-box"><span className="stat-value">{profile.raceCount}</span><span className="stat-label">RACES</span></div>
        </div>
        {isHost
          ? <button className="btn btn-primary btn-large" onClick={playAgain}>🔁 Play Again</button>
          : <p className="waiting-hint">waiting for host to start again...</p>}
      </div>
    );
  }

  return null;
}