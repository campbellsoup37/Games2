var debug = false;

var express = require("express");
var socket = require("socket.io");
var fs = require('fs');
const log = require('./logging').log

// App setup
var app = express();
var port = 6066;
var server = app.listen(port, () => log("listening to requests on port " + port))

// Static files
app.use(express.static("public"));

// Socket setup
var io = socket(server);
var userDict = {};
var gameDict = {};

// constants
var gameExpirationTime = 1000 * 10;

const card = require('./card')

// Game modules
const core = require('./core')
const ohHell = require('./oh_hell')
const hearts = require('./hearts')
const euchre = require('./euchre')

function addUser(user, confirm) {
    userDict[user.socket.id] = user;
    if (confirm) {
        user.confirmLogin();
    }
}

function removeUser(user) {
    delete userDict[user.socket.id];
    user.confirmLogout();
}

io.on("connection", function (socket) {
    log(`socket ${socket.id} connected at address ${socket.handshake.address}.`);

    socket.on("login", function (data) {
        let user = new User(socket, data.id);
        addUser(user, true);
        log(`user ${user.id} at socket ${socket.id}.`);
    });
    socket.on("logout", function () {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to logout, but they are not in the user dict.`);
            return;
        }

        log("logout", user.id);
        removeUser(user);
    });
    socket.on("disconnect", function () {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`socket ${socket.id} disconnected.`);
            return;
        }

        log(`user ${user.id} disconnected.`);

        if (user.player) {
            user.game.disconnectPlayer(user, false);
        }
        removeUser(user);
    });

    socket.on('ping', () => {
        let user = userDict[socket.id];

        if (user === undefined) {
            return;
        }

        user.send('pingback')
    })

    socket.on('gamelist', () => {
        let user = userDict[socket.id];

        if (user === undefined) {
            //log(`ERROR: socket ${socket.id} requested the game list, but they are not in the user dict.`);
            return;
        }

        user.sendGameList();
    });

    socket.on('creategame', data => {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to create a game, but they are not in the user dict.`);
            return;
        }

        if (data === undefined || data.mode === undefined || data.multiplayer === undefined || data.options === undefined) {
            log(`ERROR: socket ${socket.id} tried to create a game with invalid data.`);
            return;
        }

        let game = new Game(data.mode, data.multiplayer, data.multiplayer, data.options)

        gameDict[game.id] = game;
        user.advertise(game);

        log(`new ${data.multiplayer ? 'multiplayer' : 'single player'} game: ${game.id}, hosted by ${user.id}.`);
    });
    socket.on('joingame', id => {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to join game ${id}, but they are not in the user dict.`);
            return;
        }

        let game = gameDict[id];

        if (game === undefined) {
            user.gameJoinError();
            return;
        }

        game.joinPlayer(user);

        log(`${user.id} joined game ${game.id}.`);
    });
    socket.on('leavegame', () => {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to leave game, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (game === undefined) {
            log(`ERROR: user ${user.id} tried to join game, but they are not in a game.`);
            return;
        }

        user.game.disconnectPlayer(user);

        log(`${user.id} left game ${game.id}.`);
    });

    socket.on('autojoin', data => {
        let user = new User(socket, data.userId);
        addUser(user, false);

        let game = gameDict[data.gameId];

        if (game === undefined) {
            user.gameJoinError();
            return;
        }

        game.joinPlayer(user);

        log(`${user.id} joined game ${game.id}.`);
    });

    socket.on('player', function (data) {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to update player, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to update player, but they are not in a game.`);
            return;
        }

        game.players.updatePlayer(data);
    });
    socket.on('options', function (data) {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to update options, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to update options, but they are not in a game.`);
            return;
        }

        game.core.updateOptions(data);
    });
    socket.on('start', function () {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to start a game, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to start a game, but they are not in a game.`);
            return;
        }

        game.core.startGame();
    });
    socket.on('end', function () {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to end a game, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to end a game, but they are not in a game.`);
            return;
        }

        game.core.endGame(user.player.index);
    });
    socket.on('bid', function (data) {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to bid, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to bid, but they are not in a game.`);
            return;
        }

        game.core.incomingBid(user.player.index, data.bid);
        user.player.readiedBid = undefined;
    });
    socket.on('undobid', function (data) {
        let user = userDict[socket.id]

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to undo bid, but they are not in the user dict.`)
            return
        }

        let game = user.game

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to undo bid, but they are not in a game.`)
            return
        }

        game.core.undoBid(user.player.index)
    })
    socket.on('play', function (data) {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to play, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to play, but they are not in a game.`);
            return;
        }

        game.core.incomingPlay(user.player.index, new card.Card(data.card.num, data.card.suit));
        user.player.readiedPlay = undefined;
    });
    socket.on('pass', function (data) {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to pass, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to pass, but they are not in a game.`);
            return;
        }

        game.core.incomingPass(user.player.index, data.cards.map(c => new card.Card(c.num, c.suit)));
        user.player.readiedPass = undefined;
    });
    socket.on('trumpChoice', function (data) {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to make a trump choice, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to make a trump choice, but they are not in a game.`);
            return;
        }

        game.core.incomingTrumpChoice(user.player.index, data);
        user.player.readiedTrumpChoice = undefined;
    });
    socket.on('discard', function (data) {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to discard, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to discard, but they are not in a game.`);
            return;
        }

        game.core.incomingDiscard(user.player.index, new card.Card(data.num, data.suit));
        user.player.readiedDiscard = undefined;
    });
    socket.on('chat', function (data) {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to chat, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to chat, but they are not in a game.`);
            return;
        }

        game.core.incomingChat(user.player.index, data);
    });
    socket.on('replacewithrobot', function (index) {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to replace with robot, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to replace with robot, but they are not in a game.`);
            return;
        }

        game.core.replaceWithRobot(user.player, index);
    });
    socket.on('poke', function (index) {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to poke someone, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to poke someone, but they are not in a game.`);
            return;
        }

        game.core.poke(index);
    });
    socket.on('claim', function () {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to claim, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to claim, but they are not in a game.`);
            return;
        }

        game.core.incomingClaim(user.player.index);
    });
    socket.on('claimresponse', function (accept) {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to respond to a claim, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to respond to a claim, but they are not in a game.`);
            return;
        }

        game.core.respondToClaim(user.player.index, accept);
    });
    socket.on('decision', function (data) {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to respond to a decision, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to respond to a decision, but they are not in a game.`);
            return;
        }

        game.core.makeDecision(user.player.index, data);
        user.player.readiedDecision = undefined;
    });
    socket.on('reteam', function (data) {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to reteam, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to reteam, but they are not in a game.`);
            return;
        }

        game.core.reteam(user.player, data.index, data.team);
    });
    socket.on('scrambleteams', function () {
        let user = userDict[socket.id];

        if (user === undefined) {
            log(`ERROR: socket ${socket.id} tried to scramble teams, but they are not in the user dict.`);
            return;
        }

        let game = user.game;

        if (!user.game) {
            log(`ERROR: user ${user.id} tried to scramble teams, but they are not in a game.`);
            return;
        }

        game.core.scrambleTeams(user.player);
    });
});

// User
class User {
    constructor(socket, id) {
        this.socket = socket;
        this.id = id;
        this.player = undefined;
        this.game = undefined;
    }

    send(name, data) {
        this.socket.emit('client', { name: name, data: data })
    }

    confirmLogin() {
        this.send('loginconfirmed');
    }

    confirmLogout() {
        this.send('logoutconfirmed');
    }

    gameJoinError() {
        this.send('gamejoinerror');
    }

    advertise(game) {
        this.send('gamecreated', game.toDict());
    }

    kick() {
        this.player = undefined;
        this.game = undefined;

        if (this.socket.connected) {
            this.send('kick');
        }
    }

    sendGameList() {
        let time = new Date().getTime();
        let expires = Object.values(gameDict).filter(g => g.shouldExpire(time));
        expires.forEach(g => g.dispose());

        let games = Object.values(gameDict).filter(g => g.public && g.listed);
        this.send('gamelist', {
            games: games.map(g => g.toDict())
        });
    }
}

// Game
class Game {
    constructor(mode, mp, pub, options) {
        this.id = new Date().getTime();
        this.mode = mode;
        this.mp = mp;
        this.public = pub;
        this.listed = false;
        this.players = new core.PlayersList(this);
        this.host = undefined;

        switch (mode) {
            case 'Oh Hell':
                this.core = new ohHell.OhHellCore(this.players, this, options);
                break;
            case 'Hearts':
                this.core = new hearts.HeartsCore(this.players, this, options);
                break;
            case 'Euchre':
                this.core = new euchre.EuchreCore(this.players, this, options);
                break;
        }
    }

    toDict() {
        return {
            id: this.id,
            mp: this.mp,
            public: this.public,
            listed: this.listed,
            mode: this.mode,
            host: this.host ? this.host.id : '',
            players: this.players.players.filter(p => p.human).length,
            state: this.core.isInGame() ? 'In game' : 'In lobby'
        };
    }

    joinPlayer(user) {
        let player = this.core.createHumanPlayer(user)
        player.name = user.id;

        if (this.host === undefined) {
            this.host = player;
        }
        player.host = this.host === player;

        user.player = player;
        user.game = this;

        player.commandJoin({mp: this.mp, id: this.id, mode: this.mode});
        this.players.addPlayer(player);

        this.listed = true;
    }

    disconnectPlayer(user, kick) {
        this.players.disconnectPlayer(user.player, kick);
        user.kick();
    }

    startExpirationTimer() {
        this.expiration = new Date().getTime() + gameExpirationTime;
    }

    stopExpirationTimer() {
        this.expiration = undefined;
    }

    shouldExpire(time) {
        return this.expiration && time >= this.expiration;
    }

    jsonFilePath() {
        return `./public/cached_games/${this.id}.ohw`;
    }

    dispose() {
        fs.unlink(this.jsonFilePath(), err => {
            if (err) {
                log(`ERROR: unable to remove ${this.jsonFilePath()}.`);
            }
        });
        delete gameDict[this.id];
    }

    publishJson(json) {
        fs.writeFileSync(this.jsonFilePath(), JSON.stringify(json));
    }
}

