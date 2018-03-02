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

// Sends client file.
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
    reqSocket.emit('roomError', `${roomName} already exists`);
    return false;
  }

  rooms[roomName] = {
    roomName,
    status: 'waiting',
    time: 30,
    players: {},
  };

  // Update and Game State loop for our game. Emits to the user time and state and updates them.
  roomTimerFuncs[roomName] = setInterval(() => {
    rooms[roomName].time -= 1;
    const curRoomStatus = rooms[roomName].status;
    io.in(roomName).emit('updateTime', rooms[roomName].time, curRoomStatus);
    if (rooms[roomName].time === 0 && curRoomStatus === 'waiting') {
      rooms[roomName].status = 'playing';
      rooms[roomName].time = 60;
    } else if (rooms[roomName].time === 0 && curRoomStatus === 'playing') {
      io.in(roomName).emit('scoreGame');
      clearInterval(roomTimerFuncs[roomName]);
    }
  }, 1000);

  return true;
};

// Handles User's join room requests. Returns true if they can join,
// False with error message if they cant.
const roomJoin = (roomName, reqSocket) => {
  if (!rooms[roomName]) {
    reqSocket.emit('roomError', `${roomName} does not exist`);
    return false;
  } else if (Object.keys(rooms[roomName].players).length >= 4) {
    reqSocket.emit('roomError', `${roomName} is full`);
    return false;
  } else if (rooms[roomName].status !== 'waiting') {
    reqSocket.emit('roomError', `${roomName} is not accepting more players`);
    return false;
  }
  return true;
};

// Scores the game based on image recieved.
const scoreGame = (gameImg, roomName, imgLength) => {
  let purpleScore = 0;
  let redScore = 0;
  let blueScore = 0;
  let greenScore = 0;
  for (let i = 0; i < imgLength; i += 4) {
    // RGBA of Purple
    if (gameImg[i] === 128 &&
        gameImg[i + 1] === 0 &&
        gameImg[i + 2] === 128 &&
        gameImg[i + 3] === 255) purpleScore += 1;
    // RGBA of Red
    else if (gameImg[i] === 255 &&
               gameImg[i + 1] === 0 &&
               gameImg[i + 2] === 0 &&
               gameImg[i + 3] === 255) redScore += 1;
    // RGBA of Green
    else if (gameImg[i] === 0 &&
               gameImg[i + 1] === 255 &&
               gameImg[i + 2] === 0 &&
               gameImg[i + 3] === 255) greenScore += 1;
    // RGBA of Blue
    else if (gameImg[i] === 0 &&
               gameImg[i + 1] === 0 &&
               gameImg[i + 2] === 255 &&
               gameImg[i + 3] === 255) blueScore += 1;
  }

  if (purpleScore > redScore && purpleScore > blueScore && purpleScore > greenScore) {
    io.in(roomName).emit('results', 'Purple Wins');
  } else if (redScore > purpleScore && redScore > blueScore && redScore > greenScore) {
    io.in(roomName).emit('results', 'Red Wins');
  } else if (blueScore > purpleScore && blueScore > redScore && blueScore > greenScore) {
    io.in(roomName).emit('results', 'Blue Wins');
  } else if (greenScore > purpleScore && greenScore > redScore && greenScore > blueScore) {
    io.in(roomName).emit('results', 'Green Wins');
  } else {
    io.in(roomName).emit('results', 'There is no clear winner');
  }
  rooms[roomName].status = 'ending';
  rooms[roomName].time = 30;

  // Game ending loop, sent after results are emitted so users have the full time to see results.
  roomTimerFuncs[roomName] = setInterval(() => {
    rooms[roomName].time -= 1;
    const curRoomStatus = rooms[roomName].status;
    io.in(roomName).emit('updateTime', rooms[roomName].time, curRoomStatus);
    if (rooms[roomName].time === 0 && curRoomStatus === 'ending') {
      io.in(roomName).emit('forceMoveToLobby');
      clearInterval(roomTimerFuncs[roomName]);
    }
  }, 1000);
};

// Assigns all functions and defines the user when they connect to the client.
io.on('connection', (sock) => {
  const socket = sock;
  // Default room
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

  socket.on('sendRedCanvas', scoreGame);

  // When user requests to join a room, IF we can create it and join it, do it.
  socket.on('createRoom', (roomName) => {
    if (roomInit(roomName, socket)) {
      if (roomJoin(roomName, socket)) {
        // If user is in lobby, remove them from the lobby.
        if (socket.player.roomName === 'lobby') {
          delete rooms.lobby.players[socket.player.hash];
        } else { // If user is in another room, remove them from that room.
          delete rooms[socket.roomName].players[socket.player.hash];
        }
        // Assign player to that new room.
        socket.player.roomName = roomName;
        rooms[roomName].players[socket.player.hash] = socket.player;

        // Determines how many players are already in that room and
        // assigns the user to their specific corner and color based on join order
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
    }
  });

  // Moves the users back to the lobby
  socket.on('moveToLobby', (roomName) => {
    delete rooms[roomName].players[socket.player.hash];
    socket.player.roomName = 'lobby';
    rooms.lobby.players[socket.player.hash] = socket.player;

    socket.join('lobby');
    socket.emit('roomJoined', rooms.lobby);
    // If there are no more players in that room, delete it.
    const playerKeys = Object.keys(rooms[roomName].players);
    if (playerKeys.length === 0) {
      delete rooms[roomName];
    }
  });

  // Update the player data based on data recieved from client and
  // send it back to the other players.
  socket.on('movementUpdate', (data) => {
    socket.player = data;
    socket.player.lastUpdate = new Date().getTime();
    socket.broadcast.to(socket.player.roomName).emit('updatedMovement', socket.player);
  });

  // Handles user disconnects, removes them from the room
  socket.on('disconnect', () => {
    io.sockets.in(socket.player.roomName).emit('left', socket.player.hash);
    if (rooms[socket.player.roomName]) {
      socket.leave(socket.player.roomName);
      if (rooms[socket.player.roomName].players[socket.player.hash]) {
        delete rooms[socket.player.roomName].players[socket.player.hash];
      }
    } else {
      socket.leave('lobby');
      if (rooms.lobby.players[socket.player.hash]) {
        delete rooms.lobby.players[socket.player.hash];
      }
    }
  });
});
