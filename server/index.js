const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PROMPTS = [
  "The quick brown fox jumps over the lazy dog near the riverbank on a sunny afternoon.",
  "Programming is the art of telling another human what one wants the computer to do.",
  "In the middle of every difficulty lies opportunity waiting to be discovered.",
  "Space exploration is a force of nature unto itself that no other force in society can rival.",
  "The best way to predict the future is to invent it yourself with hard work and creativity.",
  "Simplicity is the ultimate sophistication in design and in life itself.",
  "Every great developer you know got there by solving problems they were unqualified to solve.",
  "The only way to do great work is to love what you do and never stop learning.",
  "Code is like humor. When you have to explain it, it is probably not that good.",
  "First solve the problem then write the code to make the solution work perfectly.",
];

const COUNTDOWN_SECONDS = 5;
const MIN_PLAYERS = 2;

// rooms: { [roomId]: { players, prompt, status, countdown, results } }
const rooms = {};

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoom(roomId) {
  return rooms[roomId];
}

function broadcastRoom(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  io.to(roomId).emit("room_update", {
    players: Object.values(room.players),
    status: room.status,
    prompt: room.prompt,
    countdown: room.countdown,
    results: room.results,
  });
}

function startCountdown(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  room.status = "countdown";
  room.countdown = COUNTDOWN_SECONDS;
  broadcastRoom(roomId);

  const interval = setInterval(() => {
    const r = getRoom(roomId);
    if (!r) { clearInterval(interval); return; }
    r.countdown--;
    if (r.countdown <= 0) {
      clearInterval(interval);
      r.status = "racing";
      r.raceStartTime = Date.now();
      // Reset progress
      Object.values(r.players).forEach(p => {
        p.progress = 0;
        p.wpm = 0;
        p.finished = false;
        p.finishTime = null;
        p.finishPosition = null;
      });
      r.results = [];
      broadcastRoom(roomId);
    } else {
      broadcastRoom(roomId);
    }
  }, 1000);
}

function checkAllFinished(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  const players = Object.values(room.players);
  if (players.length > 0 && players.every(p => p.finished)) {
    room.status = "finished";
    broadcastRoom(roomId);
  }
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("create_room", ({ playerName }) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      players: {},
      prompt: PROMPTS[Math.floor(Math.random() * PROMPTS.length)],
      status: "waiting",
      countdown: 0,
      results: [],
      raceStartTime: null,
    };
    rooms[roomId].players[socket.id] = {
      id: socket.id,
      name: playerName || "Racer",
      progress: 0,
      wpm: 0,
      finished: false,
      finishTime: null,
      finishPosition: null,
      isHost: true,
    };
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit("room_created", { roomId });
    broadcastRoom(roomId);
  });

  socket.on("join_room", ({ roomId, playerName }) => {
    const room = getRoom(roomId);
    if (!room) { socket.emit("error", { message: "Room not found!" }); return; }
    if (room.status !== "waiting") { socket.emit("error", { message: "Race already started!" }); return; }

    room.players[socket.id] = {
      id: socket.id,
      name: playerName || "Racer",
      progress: 0,
      wpm: 0,
      finished: false,
      finishTime: null,
      finishPosition: null,
      isHost: false,
    };
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit("room_joined", { roomId });
    broadcastRoom(roomId);
  });

  socket.on("start_race", () => {
    const roomId = socket.roomId;
    const room = getRoom(roomId);
    if (!room) return;
    const player = room.players[socket.id];
    if (!player?.isHost) return;
    if (Object.keys(room.players).length < MIN_PLAYERS) {
      socket.emit("error", { message: `Need at least ${MIN_PLAYERS} players to start!` });
      return;
    }
    room.prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    startCountdown(roomId);
  });

  socket.on("typing_update", ({ typed }) => {
    const roomId = socket.roomId;
    const room = getRoom(roomId);
    if (!room || room.status !== "racing") return;
    const player = room.players[socket.id];
    if (!player || player.finished) return;

    const prompt = room.prompt;
    let correctChars = 0;
    for (let i = 0; i < typed.length && i < prompt.length; i++) {
      if (typed[i] === prompt[i]) correctChars++;
      else break;
    }

    player.progress = Math.round((correctChars / prompt.length) * 100);

    // WPM calculation
    const elapsed = (Date.now() - room.raceStartTime) / 1000 / 60;
    if (elapsed > 0) {
      player.wpm = Math.round((correctChars / 5) / elapsed);
    }

    // Check finished
    if (correctChars === prompt.length) {
      player.finished = true;
      player.progress = 100;
      player.finishTime = Date.now() - room.raceStartTime;
      const position = room.results.length + 1;
      player.finishPosition = position;
      room.results.push({ id: socket.id, name: player.name, wpm: player.wpm, position, time: player.finishTime });
      checkAllFinished(roomId);
    }

    broadcastRoom(roomId);
  });

  socket.on("play_again", () => {
    const roomId = socket.roomId;
    const room = getRoom(roomId);
    if (!room) return;
    const player = room.players[socket.id];
    if (!player?.isHost) return;
    room.status = "waiting";
    room.results = [];
    room.countdown = 0;
    Object.values(room.players).forEach(p => {
      p.progress = 0; p.wpm = 0; p.finished = false;
      p.finishTime = null; p.finishPosition = null;
    });
    broadcastRoom(roomId);
  });

  socket.on("disconnect", () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = getRoom(roomId);
    if (!room) return;
    delete room.players[socket.id];
    if (Object.keys(room.players).length === 0) {
      delete rooms[roomId];
    } else {
      // Reassign host if needed
      const remaining = Object.values(room.players);
      if (!remaining.find(p => p.isHost)) remaining[0].isHost = true;
      broadcastRoom(roomId);
    }
    console.log("Disconnected:", socket.id);
  });
});

app.get("/", (req, res) => res.send("Typing Race XD Server 🏎️"));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));