const http = require('http');
const socketio = require('socket.io');
const fs = require('fs');
const xxh = require('xxhashjs');

const port = process.env.PORT || process.env.NODE_PORT || 55555;

const rooms = {};

rooms.lobby = {
  roomName: 'lobby',
  players: {},
};

// To create and initialize a room
const roomInit = (roomName, reqSocket) => {
  if (rooms[roomName]) {
    // Error Here, room is already created
    // socket emit error to requester
    console.log(`${roomName} already exists`);
    reqSocket.emit('roomError', `${roomName} already exists`);
    return false;
  }

  rooms[roomName] = {
    roomName,
    players: {},
  };

  console.log(`${roomName} created`);
  return true;
};

const roomJoin = (roomName, reqSocket) => {
  if (!rooms[roomName]) {
    // socket emit error to requester that it doesnt exist.
    console.log(`${roomName} does not exist`);
    reqSocket.emit('roomError', `${roomName} does not exist`);
    return false;
  } else if (Object.keys(rooms[roomName].players).length >= 4) {
    console.log(`${roomName} is full`);
    reqSocket.emit('roomError', `${roomName} is full`);
    return false;
  }

  console.log(`Joined Room: ${roomName}`);
  reqSocket.emit('roomJoined', roomName);
  return true;
};

const handler = (req, res) => {
  fs.readFile(`${__dirname}/../client/index.html`, (err, data) => {
    if (err) {
      throw err;
    }

    res.writeHead(200);
    res.end(data);
  });
};

const app = http.createServer(handler);

app.listen(port);

const io = socketio(app);

io.on('connection', (sock) => {
  const socket = sock;
  socket.join('lobby');

  socket.player = {
    hash: xxh.h32(`${socket.id}${new Date().getTime()}`, 0xCAFEBABE).toString(16),
    lastUpdate: new Date().getTime(),
    roomName: 'lobby',
  };

  rooms.lobby.players[socket.player.hash] = socket.player;

  socket.emit('joined', socket.player);

  socket.on('createRoom', (roomName) => {
    if (roomInit(roomName, socket)) {
      if (roomJoin(roomName, socket)) {
        if (socket.player.roomName === 'lobby') {
          delete rooms.lobby.players[socket.player.hash];
        } else {
          delete rooms[socket.roomName].players[socket.player.hash];
        }
        socket.join(roomName);
        socket.player.roomName = roomName;
        rooms[roomName].players[socket.player.hash] = socket.player;
        console.dir(rooms);
      }
    }
  });

  socket.on('joinRoom', (roomName) => {
    if (roomJoin(roomName, socket)) {
      if (socket.player.roomName === 'lobby') {
        delete rooms.lobby.players[socket.player.hash];
      } else {
        delete rooms[socket.roomName].players[socket.player.hash];
      }
      socket.join(roomName);
      socket.player.roomName = roomName;
      rooms[roomName].players[socket.player.hash] = socket.player;
      console.dir(rooms);
    }
  });

  socket.on('disconnect', () => {
    // io.sockets.in('lobby').emit('left', socket.player.hash);
    if (rooms[socket.roomName]) {
      socket.leave(socket.roomName);
      if (rooms[socket.roomName].players[socket.player.hash]) {
        delete rooms[socket.roomName].players[socket.player.hash];
      }
    } else {
      socket.leave('lobby');
      if (rooms.lobby.players[socket.player.hash]) {
        delete rooms.lobby.players[socket.player.hash];
      }
    }
  });
});
