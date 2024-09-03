// Connection
var client

import { createDeckImg, updateManualDarkMode } from './graphics_tools.js'

import { ClientStateLoading, ClientStateLoginMenu, ClientStateMainMenu, ClientStateModeSelect } from './state.js'

import { ClientStateOhHell, ClientStateOhHellPreGame, ClientStateOhHellBidding, ClientStateOhHellPlaying, ClientStateOhHellPostGame } from './modes/oh_hell.js'

import { ClientStateHearts, ClientStateHeartsPreGame, ClientStateHeartsPassing, ClientStateHeartsPlaying, ClientStateHeartsPostGame } from './modes/hearts.js'

import { ClientStateEuchre, ClientStateEuchrePreGame, ClientStateEuchreTrump, ClientStateEuchreDiscard, ClientStateEuchrePlaying, ClientStateEuchrePostGame } from './modes/euchre.js'

var ClientStateEnum = {
    LOADING: ClientStateLoading,
    LOGIN_MENU: ClientStateLoginMenu,
    MAIN_MENU: ClientStateMainMenu,
    MODE_SELECT: ClientStateModeSelect,

    OH_HELL_BASE: ClientStateOhHell,
    OH_HELL_PREGAME: ClientStateOhHellPreGame,
    OH_HELL_BIDDING: ClientStateOhHellBidding,
    OH_HELL_PLAYING: ClientStateOhHellPlaying,
    OH_HELL_POSTGAME: ClientStateOhHellPostGame,

    HEARTS_BASE: ClientStateHearts,
    HEARTS_PREGAME: ClientStateHeartsPreGame,
    HEARTS_PASSING: ClientStateHeartsPassing,
    HEARTS_PLAYING: ClientStateHeartsPlaying,
    HEARTS_POSTGAME: ClientStateHeartsPostGame,

    EUCHRE_BASE: ClientStateEuchre,
    EUCHRE_PREGAME: ClientStateEuchrePreGame,
    EUCHRE_TRUMP: ClientStateEuchreTrump,
    EUCHRE_DISCARD: ClientStateEuchreDiscard,
    EUCHRE_PLAYING: ClientStateEuchrePlaying,
    EUCHRE_POSTGAME: ClientStateEuchrePostGame,
}

class Client {
    constructor() {
        // vars loaded dynamically
        this.loadVars()

        // document elements
        this.frame = document.getElementById("canvas")
        this.ctx = this.frame.getContext("2d")

        // state
        this.stateCache = Object()
        this.changeState('LOADING')

        // socket
        this.socket = io.connect(this.vars.baseUrl)
        this.socket.on('client', (data) => {
            this.state.receive(data)
        })
        this.lastPing = 0
        this.pingedBack = true
        this.rtt = 0
        this.disconnected = false

        // route
        if (this.vars.username && this.vars.autojoinId) {
            this.state.autojoin()
            debugJoined()
        } else if (this.vars.username) {
            this.state.connect(this.vars.username)
            debugConnected()
        } else {
            this.changeState('LOGIN_MENU')
        }
    }

    loadVars() {
        this.vars = Object()

        let rawUrl = window.location.href
        if (rawUrl.includes('http://')) {
            rawUrl = rawUrl.split('http://')[1];
        }
        this.vars.baseUrl = `http://${rawUrl.split('/')[0]}`;

        //setCookie('username', 'soup' + Math.random().toFixed(3), 1);
        this.vars.username = getCookie('username')
        if (this.vars.username === undefined) {
            this.vars.username = ''
        }

        const urlParams = new URLSearchParams(window.location.search)
        this.vars.autojoinId = urlParams.get('gameid')
        if (this.vars.autojoinId) {
            this.vars.autojoinId = parseInt(this.vars.autojoinId)
        }

        this.vars.deckImg = createDeckImg('deckimg')
        this.vars.deckImg.dark = createDeckImg('deckimgdark')
        this.vars.deckImg.back = createDeckImg('deckimgback')
        this.vars.deckImg.back.dark = createDeckImg('deckimgbackdark')
        this.vars.deckImgSmall = createDeckImg('deckimgsmall')
        this.vars.deckImgSmall.dark = createDeckImg('deckimgsmalldark')
        this.vars.deckImgSmall.back = createDeckImg('deckimgsmallback')
        this.vars.deckImgSmall.back.dark = createDeckImg('deckimgsmallbackdark')
        this.vars.maxWid = 9 * 10 + this.vars.deckImgSmall.width

        // preferences
        this.vars.preferences = {
            darkMode: false,
            showFps: false,
            teamColorTrick: true,
            cardBack: 1,
            soundVolume: 50
        }
        function decode(val) {
            if (!isNaN(val)) {
                return Number(val)
            }
            if (val == 'true') {
                return true
            }
            if (val == 'false') {
                return false
            }
            return val
        }
        for (let k of Object.keys(this.vars.preferences)) {
            let cookie = getCookie(k)
            if (cookie !== undefined) {
                this.vars.preferences[k] = decode(cookie)
            }
        }
        document.getElementById('prefDarkMode').checked = this.vars.preferences.darkMode
        updateManualDarkMode()
        document.getElementById('prefCardBack').value = this.vars.preferences.cardBack
        document.getElementById('prefSoundVolume').value = this.vars.preferences.soundVolume
        document.getElementById('prefShowFps').checked = this.vars.preferences.showFps

        this.vars.pokeSound = new Audio('./resources/shortpoke.wav')
        this.vars.cardSound = new Audio('./resources/Card play.wav')

        this.vars.pingTime = 5000
        this.vars.disconnectTime = 60000

        this.vars.animationTime = 150
        this.vars.bidStayTime = 1500
        this.vars.trickStayTime = 1500
        this.vars.phaseChangeTime = 1000
        this.vars.messageTime = 2000
        this.vars.robotDelay = 500
    }

    changeState(key, enterData, exitData) {
        if (this.state && key == this.state.key) {
            return
        }

        if (!(key in this.stateCache)) {
            this.stateCache[key] = new ClientStateEnum[key](key, this)
        }

        let oldState = this.state

        this.state = this.stateCache[key]

        if (oldState) {
            oldState.exit(exitData)
        }
        this.state.enter(enterData)
    }

    paint() {
        this.ping()
        this.updateElementSizes()
        this.state.canvas.paint()
    }

    ping() {
        let disc = document.getElementById('disconnectedDiv')

        let now = new Date().getTime()
        let elapsed = now - this.lastPing
        if (elapsed >= this.vars.disconnectTime && !this.pingedBack) {
            this.disconnected = true
            disc.style.display = 'flex'
        }
        if (elapsed < this.vars.pingTime || !this.pingedBack) {
            return
        }
        this.emit('ping')
        this.lastPing = now
        this.pingedBack = false
        this.rtt = 0
        this.disconnected = false
        disc.style.display = 'none'
    }

    pingback() {
        let now = new Date().getTime()
        this.pingedBack = true
        this.rtt = now - this.lastPing
    }

    updateElementSizes() {
        this.cachedWidth = window.innerWidth;
        this.cachedHeight = window.innerHeight;

        this.frame.width = this.cachedWidth;
        this.frame.height = this.cachedHeight;
    }

    emit(name, data) {
        this.socket.emit(name, data)
    }

    connect(uname) {
        if (uname.length == 0) {
            return
        }

        this.vars.username = uname
        setCookie('username', uname, 365)
        this.emit('login', { id: uname })
    }

    logout() {
        this.emit('logout')
        setCookie('username', '', 0)
    }

    reloadWithId(id) {
        document.location.search = `gameid=${id}`
    }

    playSound(name) {
        let sound = this.vars[name]
        sound.volume = document.getElementById('prefSoundVolume').value / 100
        sound.play()
    }
}

function paint() {
    client.paint()
    window.requestAnimationFrame(paint)
}

window.addEventListener('load', execute);
window.addEventListener('mousemove', (e) => {
	if (client && client.state && client.state.canvas) {
        client.state.canvas.mouseMoved(e.clientX, e.clientY);
    }
});
window.addEventListener('mousedown', (e) => {
    if (client && client.state && client.state.canvas) {
        client.state.canvas.mousePressed(e.clientX, e.clientY, e.button);
    }
});
window.addEventListener('mouseup', (e) => {
    if (client && client.state && client.state.canvas) {
        client.state.canvas.mouseReleased(e.clientX, e.clientY, e.button);
    }
});
window.addEventListener('wheel', (e) => {
    if (client && client.state && client.state.canvas) {
        client.state.canvas.wheel(e.deltaY);
    }
});

function execute() {
    client = new Client()
    debugExecute()
	paint()
}

// cookies
function getCookie(cname) {
    let name = cname + "=";
    let decodedCookie = decodeURIComponent(document.cookie);
    let ca = decodedCookie.split(';');
    for (let c of ca) {
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return undefined;
}

export function setCookie(cname, cvalue, exdays) {
    const d = new Date();
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    let expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

// debug
function debugExecute() {
     //client.vars.animationTime = 1
     //client.vars.bidStayTime = 0
     //client.vars.trickStayTime = 0
     //client.vars.phaseChangeTime = 0
     //client.vars.messageTime = 0
     //client.vars.robotDelay = 0
}

function debugConnected() {
    /*multiplayer = true;
    createGame('Oh Hell');*/
}

function debugJoined() {
    /*options.robots = 6;
    options.D = 2;
    options.teams = true;
    sendOptionsUpdate();*/

    //startGame();
}

function debugAddPlayers() {
    /*if (myPlayer.isKibitzer()) {
        return;
    }*/

    //myPlayer.setKibitzer(true);
    //sendPlayerUpdate();

    //startGame();
}
