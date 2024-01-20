const io = require('socket.io')(3002, {
  cors: {
    origin: "*"
  }
});

let rooms = {};
const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 5;
const MATCHMAKING_TIMEOUT = 60 * 1000;

io.on('connection', socket => {
  console.log(`User ${socket.id} connected`);
  let room;
  let timeout;

  socket.on('findMatch', (data) => {
    for (const [index, roomObj] of Object.entries(rooms)) {
      const { topic, full, participants } = roomObj;
      if (topic === data && !full && participants.size < MAX_PARTICIPANTS) {
        room = index;
        break;
      }
    }

    if (!room) {
      room = socket.id;
      rooms[room] = {
        id: room,
        topic: data,
        users: [],
        full: false,
        participants: new Set(),
      };
    }

    socket.join(room);
    rooms[room].participants.add(socket.id);

    io.to(room).emit('userJoined', rooms[room].participants.size);

    if (rooms[room].participants.size === MAX_PARTICIPANTS) {
      rooms[room].full = true;
    }

    timeout = setTimeout(() => {
      if (rooms[room].participants.size < MIN_PARTICIPANTS) {
        io.to(room).emit('matchmakingCancelled', "Matchmaking Cancelled");
        delete rooms[room];
        socket.leave(room);
        room = "";
      } else {
        const chatRoom = `${room}`;
        io.to(room).emit('matchFound', chatRoom);
        io.sockets.adapter.rooms.set(chatRoom, new Set());
        rooms[room].participants.forEach((participant) => {
          io.sockets.sockets.get(participant).join(chatRoom);
          io.sockets.adapter.rooms.get(chatRoom).add(participant);
        });
      }
    }, MATCHMAKING_TIMEOUT);
  });

  socket.on('joinRoom', ({ roomId, userId }) => {
    const targetRoom = rooms[roomId];
    if (targetRoom) {
      targetRoom.users.push(socket.id);
      room = roomId;
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);
    } else {
      console.log(`Room ${roomId} not found`);
    }
  });

  socket.on('sendMessage', ({ roomId, newChat }) => {
    io.to(roomId).emit('receiveMessage', { username: socket.id, newChat });
  });

  socket.on('leave', ({ roomId }) => {
    const roomParticipants = io.sockets.adapter.rooms.get(roomId);
    if (roomParticipants?.size === 0) {
      delete rooms[roomId];
      console.log(`Room ${roomId} deleted`);
    } else {
      console.log(`User ${socket.id} left room ${roomId}`);
      socket.to(roomId).emit('userLeft', socket.id);
    }
    clearTimeout(timeout);
  });

  socket.on('disconnect', () => {
    console.log(`User ${socket.id} disconnected`);
    if (room) {
      socket.to(room).emit('userLeft', socket.id);
      rooms[room].users = rooms[room].users.filter(user => user !== socket.id);
      io.to(room).emit('offlineUser', rooms[room].users);
      room = "";
    }
    clearTimeout(timeout);
  });

  socket.on('error', (err) => {
    console.error(`Socket error on user ${socket.id}: ${err}`);
  });
});
