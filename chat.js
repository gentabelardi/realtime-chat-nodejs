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
  let room;
  let timeout;

  let participants = [];
  // When a user clicks "Find" button
  socket.on('findMatch', (data) => {
    // Check if there is an existing room for the given topic
    for (let index in rooms) {
      if (rooms[index].topic === data && !rooms[index].full) {
        participants = io.sockets.adapter.rooms.get(index);
        if (participants?.size < MAX_PARTICIPANTS) {
          room = index;
          break;
        } else {
          participants = [];
        }
      }
    }
    // Create a new room if no existing room is available
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

    // Add the user to the room
    socket.join(room);
    rooms[room]?.participants.add(socket.id);

    // Notify other participants that a new user has joined
    socket.nsp.in(room).emit('userJoined', rooms[room]?.participants?.size)

    if (rooms[room]?.participants?.size === MAX_PARTICIPANTS) {
      rooms[room].full = true;
    }

    timeout = setTimeout(() => {

      if (rooms[room]?.participants?.size < MIN_PARTICIPANTS) {
        io.to(room).emit('matchmakingCancelled', "Matchmaking Cancelled");
        delete rooms[room];
        socket.leave(room);
        room = "";
        participants = []
      } else {
        const chatRoom = `${room}`;
        io.to(room).emit('matchFound', chatRoom);
        io.sockets.adapter.rooms.set(chatRoom, new Set());
        rooms[room]?.participants.forEach((participant) => {
          io.sockets.sockets.get(participant).join(chatRoom);
          io.sockets.adapter.rooms.get(chatRoom).add(participant);
        });
      }
    }, MATCHMAKING_TIMEOUT);
  });


  socket.on('joinRoom', ({ roomId, userId }) => {
    if (Object.keys(rooms).length === 0) {
      console.log("room kosong")
    } else {
      for (let index in rooms) {
        if (rooms[index].id === roomId) {
          console.log("room joined")
          if (!rooms[roomId].users) {
            rooms[roomId].users = {};
          }
          rooms[roomId].users.push(socket.id)
          console.log(rooms[roomId].users)
          room = roomId;
          socket.join(roomId);
        } else {
          console.log("room not found")
        }
      }
    }
  });

  socket.emit('onlineUsers', rooms[room]?.users);


  socket.on('sendMessage', ({ roomId, newChat }) => {
    io.to(roomId).emit('receiveMessage', { username: socket.username, newChat });
  });

  socket.on('leave', ({ roomId }) => {
    if (roomId) {
      const roomParticipants = io.sockets.adapter.rooms.get(roomId);
      if (roomParticipants?.size === 0) {
        delete rooms[roomId];
        console.log('room deleted');
      } else {
        console.log("roomParticipants: ", roomParticipants)
        console.log('user leave');
        socket.to(room).emit('user left', socket.id);
      }
    }
    clearTimeout(timeout);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
    if (room) {
      socket.to(room).emit('userLeft', socket.id);
      delete rooms[room].users[socket.id];
      io.to(room).emit('offlineUser', rooms[room].users);
      room = "";
    }
    clearTimeout(timeout);
  });
});
