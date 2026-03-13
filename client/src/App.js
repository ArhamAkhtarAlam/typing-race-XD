import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import "./App.css";

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:3001";

function getBadge(wpm) {
  if (wpm >= 150) return { label: "TRANSCENDENT", emoji: "👁️", color: "#ff00ff" };
  if (wpm >= 120) return { label: "LIGHTNING", emoji: "⚡", color: "#ffdd00" };
  if (wpm >= 100) return { label: "HYPERSONIC", emoji: "🚀", color: "#00ffcc" };
  if (wpm >= 80)  return { label: "BLAZING", emoji: "🔥", color: "#ff6600" };
  if (wpm >= 60)  return { label: "SPEEDY", emoji: "💨", color: "#4488ff" };
  if (wpm >= 40)  return { label: "CRUISING", emoji: "🏎️", color: "#44ff88" };
  if (wpm >= 20)  return { label: "WARMING UP", emoji: "🌱", color: "#aaffaa" };
  return { label: "ROOKIE", emoji: "🐢", color: "#aaaaaa" };
}

function getPositionLabel(pos) {
  if (pos === 1) return "🥇 1st";
  if (pos === 2) return "🥈 2nd";
  if (pos === 3) return "🥉 3rd";
  return `${pos}th`;
}

export default function App() {
  const [screen, setScreen] = useState("home"); // home | lobby | race | results
  const [playerName, setPlayerName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [roomData, setRoomData] = useState(null);
  const [typed, setTyped] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isHost, setIsHost] = useState(false);
  const socketRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on("room_created", ({ roomId }) => {
      setRoomId(roomId);
      setIsHost(true);
      setScreen("lobby");
    });

    socket.on("room_joined", ({ roomId }) => {
      setRoomId(roomId);
      setIsHost(false);
      setScreen("lobby");
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
        if (data.status === "waiting" && prev === "results") {
          setTyped("");
          return "lobby";
        }
        return prev;
      });
    });

    socket.on("error", ({ message }) => {
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(""), 3000);
    });

    return () => socket.disconnect();
    // eslint-disable-next-line
  }, []);

  const createRoom = () => {
    if (!playerName.trim()) { setErrorMsg("Enter your name!"); return; }
    socketRef.current.emit("create_room", { playerName });
  };

  const joinRoom = () => {
    if (!playerName.trim()) { setErrorMsg("Enter your name!"); return; }
    if (!joinRoomId.trim()) { setErrorMsg("Enter a room code!"); return; }
    socketRef.current.emit("join_room", { roomId: joinRoomId.toUpperCase(), playerName });
  };

  const startRace = () => socketRef.current.emit("start_race");
  const playAgain = () => socketRef.current.emit("play_again");

  const handleTyping = useCallback((e) => {
    const val = e.target.value;
    setTyped(val);
    socketRef.current.emit("typing_update", { typed: val });
  }, []);

  const myPlayer = roomData?.players?.find(p => p.id === socketRef.current?.id);
  const prompt = roomData?.prompt || "";

  // Render typed chars with color coding
  const renderPrompt = () => {
    return prompt.split("").map((char, i) => {
      let cls = "char-pending";
      if (i < typed.length) {
        cls = typed[i] === char ? "char-correct" : "char-wrong";
      } else if (i === typed.length) {
        cls = "char-cursor";
      }
      return <span key={i} className={cls}>{char}</span>;
    });
  };

  // ─── HOME SCREEN ───────────────────────────────────────────────────────────
  if (screen === "home") return (
    <div className="screen home-screen">
      <div className="home-bg" />
      <div className="home-content">
        <div className="logo-area">
          <div className="logo-title">TYPING<br/>RACE</div>
          <div className="logo-xd">XD</div>
        </div>
        <div className="tagline">how fast are your fingers?</div>

        <div className="home-form">
          <input
            className="text-input"
            placeholder="your name..."
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createRoom()}
            maxLength={20}
          />

          <button className="btn btn-primary" onClick={createRoom}>
            🏎️ Create Room
          </button>

          <div className="divider">or join existing</div>

          <div className="join-row">
            <input
              className="text-input room-input"
              placeholder="room code..."
              value={joinRoomId}
              onChange={e => setJoinRoomId(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && joinRoom()}
              maxLength={6}
            />
            <button className="btn btn-secondary" onClick={joinRoom}>Join</button>
          </div>

          {errorMsg && <div className="error-msg">{errorMsg}</div>}
        </div>
      </div>
    </div>
  );

  // ─── LOBBY SCREEN ──────────────────────────────────────────────────────────
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
              <span className="player-avatar">{p.name[0].toUpperCase()}</span>
              <span className="player-name">{p.name}</span>
              {p.isHost && <span className="host-badge">HOST</span>}
            </div>
          ))}
        </div>

        {isHost ? (
          <div className="start-area">
            {roomData?.players?.length < 2 && (
              <p className="waiting-hint">share the room code with a friend to start!</p>
            )}
            <button
              className="btn btn-primary btn-large"
              onClick={startRace}
              disabled={roomData?.players?.length < 2}
            >
              🚦 Start Race!
            </button>
          </div>
        ) : (
          <p className="waiting-hint">waiting for host to start the race...</p>
        )}

        {errorMsg && <div className="error-msg">{errorMsg}</div>}
      </div>
    </div>
  );

  // ─── RACE SCREEN ───────────────────────────────────────────────────────────
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
        <div className="progress-self">
          <span className="progress-pct">{myPlayer?.progress || 0}%</span>
        </div>
      </div>

      {/* Player progress bars */}
      <div className="progress-bars">
        {roomData?.players?.map((p, i) => (
          <div key={p.id} className="progress-row">
            <span className="progress-name">{p.name}</span>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${p.progress}%`,
                  background: `hsl(${i * 60}, 80%, 55%)`
                }}
              />
              <span className="progress-car" style={{ left: `${p.progress}%` }}>🏎️</span>
            </div>
            <span className="progress-wpm">{p.wpm} wpm</span>
          </div>
        ))}
      </div>

      {/* Typing area */}
      <div className="typing-area">
        <div className="prompt-display">{renderPrompt()}</div>
        <textarea
          ref={inputRef}
          className="typing-input"
          value={typed}
          onChange={handleTyping}
          disabled={myPlayer?.finished || roomData?.status !== "racing"}
          placeholder={roomData?.status === "countdown" ? "get ready..." : "start typing!"}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>

      {myPlayer?.finished && (
        <div className="finished-banner">
          ✅ You finished! {getPositionLabel(myPlayer.finishPosition)} — waiting for others...
        </div>
      )}
    </div>
  );

  // ─── RESULTS SCREEN ────────────────────────────────────────────────────────
  if (screen === "results") {
    const sorted = [...(roomData?.results || [])].sort((a, b) => a.position - b.position);
    const myResult = sorted.find(r => r.id === socketRef.current?.id);
    const badge = myResult ? getBadge(myResult.wpm) : null;

    return (
      <div className="screen results-screen">
        <div className="results-title">RACE OVER!</div>

        {badge && (
          <div className="badge-display" style={{ borderColor: badge.color, boxShadow: `0 0 30px ${badge.color}44` }}>
            <div className="badge-emoji">{badge.emoji}</div>
            <div className="badge-label" style={{ color: badge.color }}>{badge.label}</div>
            <div className="badge-wpm">{myResult.wpm} WPM</div>
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

        {isHost ? (
          <button className="btn btn-primary btn-large" onClick={playAgain}>
            🔁 Play Again
          </button>
        ) : (
          <p className="waiting-hint">waiting for host to start again...</p>
        )}
      </div>
    );
  }

  return null;
}