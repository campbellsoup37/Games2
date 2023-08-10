import { TimerEntry, PlainCanvas, LoginMenuCanvas, MainMenuCanvas, ModeSelectCanvas } from './canvas.js'

class Options {
    constructor() {
        this.robots = 0;
        this.D = 1;
        this.teams = false;
        this.oregon = false;
    }

    toDict() {
        return {
            robots: this.robots,
            D: this.D,
            teams: this.teams,
            oregon: this.oregon
        };
    }

    update(options) {
        this.robots = options.robots;
        this.D = options.D;
        this.teams = options.teams;
        this.oregon = options.oregon;
    }
}

export class ClientState {
    constructor(key, client, div, canvas) {
        this.key = key
        this.client = client
        this.div = div
        this.canvas = canvas
    }

    enter(data) {
        if (this.div) {
            this.div.style.display = 'flex'
        }
    }

    exit(data) {
        //this.canvas.timerQueue.clear(); //TODO
        if (this.div) {
            this.div.style.display = 'none'
        }
    }

    receive(data) {
        if (!(data.name in this)) {
            console.log(`Error: state ${this.key} received data with unimplemented name ${data.name}: `, data.data)
            return
        }
        this[data.name](data.data)
    }

    pushBasicTimer(func, delay, front) {
        let te = new TimerEntry(delay ? delay : 0);
        te.onLastAction = func;
        this.canvas.pushTimerEntry(te, front);
    }

    // server entry points
    loginconfirmed() {
        this.client.changeState('MAIN_MENU')
        if (this.client.vars.autojoinId) {
            joinGame(this.client.vars.autojoinId);
        }
    }

    logoutconfirmed() {
        this.client.changeState('LOGIN_MENU')
    }

    pingback() {
        this.client.pingback()
    }

    join(data) {
        this.client.vars.autojoinId = data.id

        let key = data.mode.replace(' ', '_').toUpperCase() + '_BASE'
        this.client.changeState(key)
    }

    gamejoinerror() {
        document.location = this.client.vars.baseUrl
    }

    // client internal
    connect(uname) {
        this.client.connect(uname)
    }

    logout() {
        this.client.logout()
    }

    autojoin() {
        this.client.emit('autojoin', { userId: this.client.vars.username, gameId: this.client.vars.autojoinId })
    }
}

export class ClientStateLoading extends ClientState {
    constructor(key, client) {
        super(
            key, client,
            document.getElementById('loadingDiv'),
            new PlainCanvas(client)
        )
    }
}

export class ClientStateLoginMenu extends ClientState {
    constructor(key, client) {
        super(
            key, client,
            document.getElementById('loginMenuDiv'),
            new LoginMenuCanvas(client)
        )
    }
}

export class ClientStateMainMenu extends ClientState {
    constructor(key, client) {
        super(
            key, client,
            document.getElementById('mainMenuDiv'),
            new MainMenuCanvas(client)
        )
        this.games = []
    }

    enter(data) {
        super.enter(data)
        this.canvas.refreshGames()
    }

    // server entry points
    gamelist(data) {
        this.games = data.games
    }

    // client internal
    requestGameList() {
        this.client.emit('gamelist')
    }

    joinGame(id) {
        this.client.reloadWithId(id)
    }

    goToModeSelect(mp) {
        this.client.changeState('MODE_SELECT', { multiplayer: mp })
    }

    openFile() {
        var input = document.createElement('input');
        input.type = 'file';

        input.onchange = e => {
            var file = e.target.files[0];
            var reader = new FileReader();
            reader.readAsText(file, 'UTF-8');
            reader.onload = readerEvent => {
                let data = JSON.parse(readerEvent.target.result);

                if (data === undefined) {
                    alert('Unable to open file');
                    return;
                }

                let mode = data.mode;
                if (mode == 'Oh Hell') {
                    this.client.changeState('OH_HELL_BASE', data)
                    this.client.changeState('OH_HELL_POSTGAME', data)
                }
            }
        }

        input.click();
    }
}

export class ClientStateModeSelect extends ClientState {
    constructor(key, client) {
        super(
            key, client,
            document.getElementById('modeSelectDiv'),
            new ModeSelectCanvas(client)
        )
    }

    enter(data) {
        super.enter(data)
        this.multiplayer = data.multiplayer
    }

    // server entry points
    gamecreated(data) {
        if (data.mp) {
            this.client.reloadWithId(data.id)
        } else {
            this.joinGame(data.id)
        }
    }

    // client internal
    createGame(mode) {
        // TO DO: get default options per mode
        let options = new Options()
        if (!this.multiplayer && options.robots == 0) {
            switch (mode) {
            case 'Oh Hell':
                options.robots = 4
                break
            case 'Hearts':
                options.robots = 2
                break
            case 'Euchre':
                options.robots = 3
                break
            }
        }
        this.client.emit('creategame', { mode: mode, multiplayer: this.multiplayer, options: options })
    }

    joinGame(id) {
        this.client.emit('joingame', id)
    }
}