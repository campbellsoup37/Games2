import {
    font, colors, drawText, drawBox, drawOval, createDeckImg, drawCard, drawLine, enableButton, disableButton
} from './graphics_tools.js'

import {
    CanvasInteractable, WrappedDOMElement, PanelInteractable, CanvasButton, PlayerNamePlate, CanvasCard
} from './interactable.js'

export class TimerQueue {
    constructor() {
        this.entries = [];
    }

    push(entry, toFront) {
        if (arguments.length < 2) {
            toFront = false;
        }

        if (toFront) {
            if (this.entries.length == 0 || this.entries.firstAction) {
                this.entries.unshift(entry);
            } else {
                this.entries.splice(1, 0, entry);
            }
        } else {
            this.entries.push(entry);
        }
    }

    tick() {
        if (!this.entries.length) {
            return;
        }

        if (this.entries[0].tick()) {
            this.entries.shift();
        }
    }

    clear() {
        this.entries = [];
    }
}

export class TimerEntry {
    constructor(endTime) {
        this.endTime = endTime;
        this.firstAction = true;
        this.elapsedTime = 0;
    }

    tick() {
        if (this.firstAction) {
            this.onFirstAction();
            this.startTime = new Date().getTime();
            this.firstAction = false;
        }

        this.elapsedTime = new Date().getTime() - this.startTime;

        this.onAction();

        if (this.elapsedTime >= this.endTime) {
            this.onLastAction();
            return true;
        }
        return false;
    }

    onFirstAction() { }
    onAction() { }
    onLastAction() { }
}

export class OhcCanvas {
    constructor(client, shouldInitialize) {
        this.client = client
        this.interactableMoused = undefined;
        this.interactablePressed = undefined;
        this.timerQueue = new TimerQueue();
        if (((arguments.length == 1) || shouldInitialize) && (this.initialize !== undefined)) {
            this.initialize();
        }
    }

    setBackground(image) {
        this.background = image;
    }

    backgroundCenterX() {
        return this.client.cachedWidth / 2;
    };

    backgroundCenterY() {
        return this.client.cachedHeight / 2;
    };

    isShown() {
        return true;
    };

    pushTimerEntry(entry, front) {
        this.timerQueue.push(entry, front);
    }

    mouseMoved(x, y) {
        if (this.interactables === undefined) {
            return;
        }

        if (this.interactablePressed !== undefined && this.interactablePressed.draggable) {
            this.interactablePressed.dragTo(x, y);
        } else {
            let anyMoused = false;

            for (let i = 0; i < this.interactables.length; i++) {
                for (let j = 0; j < this.interactables[i].length; j++) {
                    let inter = this.interactables[i][j];
                    let moused = inter.updateMoused(x, y);
                    if (moused !== undefined) {
                        if (this.interactableMoused !== undefined && this.interactableMoused !== moused) {
                            this.interactableMoused.setMoused(false);
                            this.interactableMoused.setPressed(false);
                        }
                        this.interactableMoused = moused;
                        anyMoused = true;
                    }
                }
            }

            if (this.interactableMoused !== undefined && !anyMoused) {
                this.interactableMoused.setMoused(false);
                this.interactableMoused.setPressed(false);
                this.interactableMoused = undefined;
            }
        }

        if (!this.interactableMoused) {
            document.body.style.cursor = 'default';
        }
    }

    mousePressed(x, y, button) {
        if (button == 0) {
            this.mouseMoved(x, y);
            if (this.interactableMoused !== undefined) {
                this.interactableMoused.setPressed(true);
                this.interactablePressed = this.interactableMoused;
            }
        } else if (button == 2 && this.rightClick != undefined) {
            this.rightClick(x, y);
        }
    }

    mouseReleased(x, y, button) {
        if (button == 0) {
            if (this.interactableMoused !== undefined && this.interactableMoused == this.interactablePressed) {
                let relay = this.interactableMoused;
                this.interactableMoused = undefined;
                this.interactablePressed = undefined;
                if (relay.click !== undefined) {
                    relay.click();
                    return;
                }
            }
            this.mouseMoved(x, y);
        }

        // nothing was clicked
        if (this.clickOnNothing !== undefined) {
            this.clickOnNothing();
        }
    }

    wheel(y) {
        if (this.interactableMoused !== undefined) {
            this.interactableMoused.wheel(y);
        }
    }

    keyPressed(code) { }

    paint() {
        if (!this.isShown()) {
            return;
        }

        if (this.background !== undefined) {
            let ratios = [
                this.backgroundCenterX() * 2 / this.background.width,
                (this.client.cachedWidth - this.backgroundCenterX()) * 2 / this.background.width,
                this.backgroundCenterY() * 2 / this.background.height,
                (this.client.cachedHeight - this.backgroundCenterY()) * 2 / this.background.height
            ];
            let scale = 1;
            for (let i = 0; i < 4; i++) {
                scale = Math.max(scale, ratios[i]);
            }

            this.client.ctx.drawImage(this.background,
                this.backgroundCenterX() - scale * this.background.width / 2,
                this.backgroundCenterY() - scale * this.background.height / 2,
                scale * this.background.width,
                scale * this.background.height
            );
        }

        if (this.customPaintFirst !== undefined) {
            this.customPaintFirst();
        }

        this.timerQueue.tick();

        if (this.interactables !== undefined) {
            for (let i = 0; i < this.interactables.length; i++) {
                for (let j = 0; j < this.interactables[i].length; j++) {
                    this.interactables[i][j].paint();
                }
            }
        }

        if (this.customPaintLast !== undefined) {
            this.customPaintLast();
        }
    }
}

export class PlainCanvas extends OhcCanvas {
    constructor(client) {
        super(client);
    }

    initialize() {
        this.setBackground(document.getElementById('background'));
    }
}

export class LoginMenuCanvas extends OhcCanvas {
    constructor(client) {
        super(client);
    }

    initialize() {
        this.setBackground(document.getElementById('background'))

        let lmUsername = document.getElementById("lmUsername")
        lmUsername.addEventListener('keydown', e => {
            if (e.keyCode == 13) {
                this.client.state.connect(lmUsername.value)
            }
        })

        document.getElementById("lmConnect").addEventListener('click', () => {
            this.client.state.connect(lmUsername.value)
        })
    }
}

export class MainMenuCanvas extends OhcCanvas {
    constructor(client) {
        super(client);
    }

    initialize() {
        this.setBackground(document.getElementById('background'))

        let joinGameButton = document.getElementById('mmJoinMp')
        joinGameButton.addEventListener('click', () => this.client.state.joinGame(this.gameSelected()))

        document.getElementById('mmHostMp').addEventListener('click', () => this.client.state.goToModeSelect(true))
        document.getElementById('mmSinglePlayer').addEventListener('click', () => this.client.state.goToModeSelect(false))

        document.getElementById('mmSavedGame').addEventListener('click', () => this.client.state.openFile())
        document.getElementById('mmLogout').addEventListener('click', () => this.client.state.logout())

        let canvas = this

        class GameListEntry extends CanvasInteractable {
            constructor(i) {
                super();
                this.index = i;
            }
        }
        class GameList extends PanelInteractable {
            constructor() {
                super(
                    document.getElementById('mmGameListContainer'),
                    document.getElementById('mmGameListCanvas'),
                    true
                );
                this.size = 0;
                this.headerHeight = 20;
                this.lineV = 10;

                this.columnXs = [1 / 10, 3 / 10, 5 / 10, 7 / 10, 9 / 10];

                this.selected = -1;
            }

            games() {
                return canvas.client.state.games
            }

            paint() {
                super.paint();

                if (this.games().length != this.size) {
                    this.makeGameInteractables();
                }

                if (this.selected == -1) {
                    disableButton(joinGameButton);
                } else {
                    enableButton(joinGameButton);
                }

                drawText(this.ctx, 'id', this.width() * this.columnXs[0], this.headerHeight / 2, 1, 1, font.bold, 'black');
                drawText(this.ctx, 'host', this.width() * this.columnXs[1], this.headerHeight / 2, 1, 1, font.bold, 'black');
                drawText(this.ctx, 'game', this.width() * this.columnXs[2], this.headerHeight / 2, 1, 1, font.bold, 'black');
                drawText(this.ctx, '# players', this.width() * this.columnXs[3], this.headerHeight / 2, 1, 1, font.bold, 'black');
                drawText(this.ctx, 'status', this.width() * this.columnXs[4], this.headerHeight / 2, 1, 1, font.bold, 'black');
                drawLine(this.ctx, 2, this.headerHeight + this.lineV / 2, this.width() - 2, this.headerHeight + this.lineV / 2);

                for (const inter of this.interactables) {
                    inter.paint();
                }
            }

            makeGameInteractables() {
                this.interactables.length = 0;

                let games = this.games()
                for (let i = 0; i < games.length; i++) {
                    let entry = new GameListEntry(i);
                    entry.x = () => { return this.x(); };
                    entry.offset = this.headerHeight + this.lineV + 20 * i;
                    entry.y = () => { return this.y() + entry.offset; };
                    entry.width = () => { return this.width(); };
                    entry.height = () => { return 20; };
                    entry.paint = () => {
                        let fnt = font.basic;

                        if (i == this.selected) {
                            let fnt = font.bold;
                            this.ctx.fillStyle = 'rgb(230, 230, 230)';
                            drawBox(this.ctx, 2, entry.offset, entry.width() - 4, entry.height(), 10);
                        }
                        let inGame = games[i].state == 'In game';

                        let modeColor = 'black';
                        switch (games[i].mode) {
                            case 'Oh Hell':
                                modeColor = 'green';
                                break;
                            case 'Hearts':
                                modeColor = 'rgb(255, 100, 100)';
                                break;
                            case 'Euchre':
                                modeColor = 'rgb(255, 255, 100)';
                                break;
                        }

                        drawText(this.ctx, games[i].id, entry.width() * this.columnXs[0], entry.offset + entry.height() / 2, 1, 1, fnt, 'black');
                        drawText(this.ctx, games[i].host.substring(0, 15), entry.width() * this.columnXs[1], entry.offset + entry.height() / 2, 1, 1, fnt, 'black');
                        drawText(this.ctx, games[i].mode, entry.width() * this.columnXs[2], entry.offset + entry.height() / 2, 1, 1, fnt, modeColor);
                        drawText(this.ctx, games[i].players, entry.width() * this.columnXs[3], entry.offset + entry.height() / 2, 1, 1, fnt, 'black');
                        drawText(this.ctx, games[i].state, entry.width() * this.columnXs[4], entry.offset + entry.height() / 2, 1, 1, fnt, inGame ? 'orange' : 'green');
                    };
                    entry.click = () => { this.selected = i; };
                    this.interactables.push(entry);
                }

                if (games.length && this.selected < 0) {
                    this.selected = 0;
                } else if (this.selected >= games.length) {
                    this.selected = games.length - 1;
                }

                this.size = games.length;
            }
        }
        this.gameList = new GameList();

        this.interactables = [[this.gameList]];
    }

    gameSelected() {
        let games = this.gameList.games()
        if (this.gameList.selected < 0 || this.gameList.selected >= games.length) {
            return undefined
        } else {
            return games[this.gameList.selected].id
        }
    }

    refreshGames() {
        if (!this.client.state.requestGameList) {
            return
        }

        let te = new TimerEntry(500);
        te.onFirstAction = () => { this.client.state.requestGameList() };
        te.onLastAction = () => { this.refreshGames() }
        this.pushTimerEntry(te)
    }
}

export class ModeSelectCanvas extends OhcCanvas {
    constructor(client) {
        super(client);
    }

    initialize() {
        this.setBackground(document.getElementById('background'));

        document.getElementById("msOhHell").addEventListener('click', () => {
            this.client.state.createGame('Oh Hell')
        })
        document.getElementById("msHearts").addEventListener('click', () => {
            this.client.state.createGame('Hearts')
        })
        document.getElementById("msEuchre").addEventListener('click', () => {
            this.client.state.createGame('Euchre')
        })
        document.getElementById("msBack").addEventListener('click', () => {
            this.client.changeState('MAIN_MENU')
        })
    }
}
