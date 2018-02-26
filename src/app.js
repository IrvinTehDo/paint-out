const http = require('http');
const socketio = require('socket.io');
const fs = require('fs');
const xxh = require('xxhashjs');

const port = process.env.PORT || process.env.NODE_PORT || 55555;

const rooms = {};

const roomTimerFuncs = {};

rooms.lobby = {
  roomName: 'lobby',
  players: {},
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
    status: 'waiting',
    time: 45,
    players: {},
  };

  roomTimerFuncs[roomName] = setInterval(() => {
    rooms[roomName].time -= 1;
    io.in(roomName).emit('updateTime', rooms[roomName].time);
  }, 1000);

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
  return true;
};


io.on('connection', (sock) => {
  const socket = sock;
  socket.join('lobby');

  socket.player = {
    hash: xxh.h32(`${socket.id}${new Date().getTime()}`, 0xCAFEBABE).toString(16),
    lastUpdate: new Date().getTime(),
    roomName: 'lobby',
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    destX: 0,
    destY: 0,
    alpha: 0,
    height: 100,
    width: 100,
    color: 'red',
  };

  rooms.lobby.players[socket.player.hash] = socket.player;

  socket.emit('joined', socket.player, rooms.lobby);

  socket.on('createRoom', (roomName) => {
    if (roomInit(roomName, socket)) {
      if (roomJoin(roomName, socket)) {
        if (socket.player.roomName === 'lobby') {
          delete rooms.lobby.players[socket.player.hash];
        } else {
          delete rooms[socket.roomName].players[socket.player.hash];
        }
        // socket.join(roomName);
        socket.player.roomName = roomName;
        rooms[roomName].players[socket.player.hash] = socket.player;

        const playerKeys = Object.keys(rooms[roomName].players);
        for (let i = 0; i < playerKeys.length; i++) {
          if (socket.player.hash === rooms[roomName].players[playerKeys[i]].hash) {
            if (i === 0) {
              socket.player.x = 0;
              socket.player.y = 0;
              socket.player.color = 'red';
              rooms[roomName].players[socket.player.hash].x = socket.player.x;
              rooms[roomName].players[socket.player.hash].y = socket.player.y;
              rooms[roomName].players[socket.player.hash].color = socket.player.color;
            } else if (i === 1) {
              socket.player.x = 700;
              socket.player.y = 0;
              socket.player.color = 'blue';
              rooms[roomName].players[socket.player.hash].x = socket.player.x;
              rooms[roomName].players[socket.player.hash].y = socket.player.y;
              rooms[roomName].players[socket.player.hash].color = socket.player.color;
            } else if (i === 2) {
              socket.player.x = 0;
              socket.player.y = 500;
              socket.player.color = 'green';
              rooms[roomName].players[socket.player.hash].x = socket.player.x;
              rooms[roomName].players[socket.player.hash].y = socket.player.y;
              rooms[roomName].players[socket.player.hash].color = socket.player.color;
            } else if (i === 3) {
              socket.player.x = 700;
              socket.player.y = 500;
              socket.player.color = 'purple';
              rooms[roomName].players[socket.player.hash].x = socket.player.x;
              rooms[roomName].players[socket.player.hash].y = socket.player.y;
              rooms[roomName].players[socket.player.hash].color = socket.player.color;
            }
          }
        }
        socket.join(roomName);
        socket.emit('roomJoined', rooms[roomName]);
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

      socket.player.roomName = roomName;
      rooms[roomName].players[socket.player.hash] = socket.player;

      const playerKeys = Object.keys(rooms[roomName].players);
      for (let i = 0; i < playerKeys.length; i++) {
        if (socket.player.hash === rooms[roomName].players[playerKeys[i]].hash) {
          if (i === 0) {
            socket.player.x = 0;
            socket.player.y = 0;
            socket.player.prevX = 0;
            socket.player.prevY = 0;
            socket.player.destX = 0;
            socket.player.destY = 0;
            socket.player.color = 'red';
            rooms[roomName].players[socket.player.hash].x = socket.player.x;
            rooms[roomName].players[socket.player.hash].y = socket.player.y;
            rooms[roomName].players[socket.player.hash].prevX = socket.player.prevX;
            rooms[roomName].players[socket.player.hash].prevY = socket.player.prevY;
            rooms[roomName].players[socket.player.hash].destX = socket.player.destX;
            rooms[roomName].players[socket.player.hash].destY = socket.player.destY;
            rooms[roomName].players[socket.player.hash].color = socket.player.color;
          } else if (i === 1) {
            socket.player.x = 700;
            socket.player.y = 0;
            socket.player.prevX = 700;
            socket.player.prevY = 0;
            socket.player.destX = 700;
            socket.player.destY = 0;
            socket.player.color = 'blue';
            rooms[roomName].players[socket.player.hash].x = socket.player.x;
            rooms[roomName].players[socket.player.hash].y = socket.player.y;
            rooms[roomName].players[socket.player.hash].prevX = socket.player.prevX;
            rooms[roomName].players[socket.player.hash].prevY = socket.player.prevY;
            rooms[roomName].players[socket.player.hash].destX = socket.player.destX;
            rooms[roomName].players[socket.player.hash].destY = socket.player.destY;
            rooms[roomName].players[socket.player.hash].color = socket.player.color;
          } else if (i === 2) {
            socket.player.x = 0;
            socket.player.y = 500;
            socket.player.prevX = 0;
            socket.player.prevY = 500;
            socket.player.destX = 0;
            socket.player.destY = 500;
            socket.player.color = 'green';
            rooms[roomName].players[socket.player.hash].x = socket.player.x;
            rooms[roomName].players[socket.player.hash].y = socket.player.y;
            rooms[roomName].players[socket.player.hash].prevX = socket.player.prevX;
            rooms[roomName].players[socket.player.hash].prevY = socket.player.prevY;
            rooms[roomName].players[socket.player.hash].destX = socket.player.destX;
            rooms[roomName].players[socket.player.hash].destY = socket.player.destY;
            rooms[roomName].players[socket.player.hash].color = socket.player.color;
          } else if (i === 3) {
            socket.player.x = 700;
            socket.player.y = 500;
            socket.player.prevX = 700;
            socket.player.prevY = 500;
            socket.player.destX = 700;
            socket.player.destY = 500;
            socket.player.color = 'purple';
            rooms[roomName].players[socket.player.hash].x = socket.player.x;
            rooms[roomName].players[socket.player.hash].y = socket.player.y;
            rooms[roomName].players[socket.player.hash].prevX = socket.player.prevX;
            rooms[roomName].players[socket.player.hash].prevY = socket.player.prevY;
            rooms[roomName].players[socket.player.hash].destX = socket.player.destX;
            rooms[roomName].players[socket.player.hash].destY = socket.player.destY;
            rooms[roomName].players[socket.player.hash].color = socket.player.color;
            rooms[roomName].players[socket.player.hash].color = socket.player.color;
          }
        }
      }
      socket.join(roomName);
      socket.emit('roomJoined', rooms[roomName]);
      console.dir(rooms);
    }
  });

  socket.on('movementUpdate', (data) => {
    socket.player = data;
    socket.player.lastUpdate = new Date().getTime();
    socket.broadcast.to(socket.player.roomName).emit('updatedMovement', socket.player);
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
