import { Card } from '../basics.js'

import {
    font, colors, smallCardScale, getStringDimensions, drawText, drawBox, drawOval, createDeckImg, drawCard, drawLine, enableButton, disableButton, toggleButton
} from '../graphics_tools.js'

import {
    CanvasInteractable, WrappedDOMElement, PanelInteractable, CanvasButton, PlayerNamePlate, CanvasCard
} from '../interactable.js'

import { TimerEntry, OhcCanvas } from '../canvas.js'

import { PostGamePage, PostGamePlotTab } from '../postgame.js'

import { ClientStateGameBase, createClientStatePreGame, createClientStatePlaying, createClientStatePostGame, CanvasBase } from './base.js'

// states

export class ClientStateEuchre extends ClientStateGameBase {
    constructor(key, client, div) {
        super(key, 'EUCHRE_BASE', client, div, key == 'EUCHRE_BASE' ? EuchreCanvas : undefined)
    }

    initialize() {
        super.initialize()
        this.trumpTimer = 1
        this.pickUpTimer = 0
    }

    updateServerData_options(type, diff) {
        let options = this.baseState.serverData.options
        if (options.robots !== undefined) {
            this.canvas.robotsSpinner.value = options.robots
        }
    }

    paintUpCard() { return false }
    upCardIsDown() { return true }
    upCardIsDrawn() { return false }
    paintTrumpInteractables() { return false }
}

export class ClientStateEuchrePreGame extends createClientStatePreGame(ClientStateEuchre) {
    constructor(key, client) {
        super(key, client)
    }

    enter(data) {
        super.enter(data)
        document.getElementById("doubleDeckOptionsRow").style.display = 'none'
        document.getElementById("teamsOptionsRow").style.display = 'none'
        document.getElementById("oregonOptionsRow").style.display = 'none'
    }

    reteam(index, team) { }
    scrambleTeams() { }
}

export class ClientStateEuchreTrump extends ClientStateEuchre {
    constructor(key, client) {
        super(key, client, document.getElementById('inGameDiv'))
    }

    initialize() {
        this.baseState = this.client.stateCache[this.baseKey]
    }

    enter(data) {
        super.enter(data)
        this.baseState.clearPreselected(0)
        this.baseState.trumpTimer = 0
    }

    animateTrump() {
        let animateTe = new TimerEntry(this.client.vars.animationTime);
        animateTe.onAction = () => {
            this.baseState.trumpTimer = Math.min(animateTe.elapsedTime / this.client.vars.animationTime, 1)
        }
        this.canvas.pushTimerEntry(animateTe, true);

        let stayTe = new TimerEntry(this.client.vars.bidStayTime);
        this.canvas.pushTimerEntry(stayTe, true);

        let bufferTe = new TimerEntry(0);
        this.canvas.pushTimerEntry(bufferTe, true);
    }

    updateServerData_phase(type, diff) {
        if (diff.phase == 1) {
            this.pushBasicTimer(() => { }, this.client.vars.phaseChangeTime, true)
        }
    }

    updateServerData_declarer(type, diff) {
        this.animateTrump()
    }

    updateServerDataArgs_resort(type, args) {
        if (!this.baseState.myPlayer.kibitzer) {
            this.canvas.makeHandInteractables()
        }
    }

    adjustDivSizes() { this.canvas.fixScoreWidth() }
    paintPlayers() { return true }
    paintCornerButtons() { return true }
    paintPreselected() { return true }
    paintNamePlates() { return true }
    highlightPlayer(player) { return player.index == this.baseState.serverData.turn }
    enablePoking(player) { return this.highlightPlayer(player) }
    cardEnabled(card) { return false }
    paintHandInteractables() { return true }
    checkIfShouldPlayPreselected() { return false }
    paintUpCard() { return true }
    upCardIsDown() { return this.baseState.serverData.phase == 1 }
    paintTrumpInteractables() { return this.isItMyTurn() }
    getTrumpChoices() {
        let serverData = this.baseState.serverData
        let ans = []
        if (!(serverData.turn == serverData.rounds[serverData.roundNumber].dealer && serverData.phase == 1)) {
            ans.push({ pass: true, suit: -1, alone: false })
        }
        if (serverData.phase == 0) {
            ans.push({ pass: false, suit: serverData.upCard.suit, alone: false })
            ans.push({ pass: false, suit: serverData.upCard.suit, alone: true })
        } else {
            for (let i = 0; i < 4; i++) {
                if (i == serverData.upCard.suit) {
                    continue
                }
                ans.push({ pass: false, suit: i, alone: false })
                ans.push({ pass: false, suit: i, alone: true })
            }
        }
        return ans
    }
    paintScoreSheet() { return true }

    makeTrumpChoice(choice) {
        this.client.emit('trumpChoice', choice)
    }
}

export class ClientStateEuchreDiscard extends ClientStateEuchre {
    constructor(key, client) {
        super(key, client, document.getElementById('inGameDiv'))
    }

    initialize() {
        this.baseState = this.client.stateCache[this.baseKey]
    }

    animatePickUp(reverse) {
        let animateTe = new TimerEntry(this.client.vars.animationTime);
        animateTe.onAction = () => {
            this.baseState.pickUpTimer = reverse + (1 - 2 * reverse) * Math.min(animateTe.elapsedTime / this.client.vars.animationTime, 1)
        }
        animateTe.onLastAction = () => this.pickedUp = true
        this.canvas.pushTimerEntry(animateTe, true);
    }

    enter(data) {
        super.enter(data)
        this.pickedUp = false
        this.animatePickUp(0)
    }

    exit(data) {
        super.exit(data)
        this.animatePickUp(1)
    }

    dealer() { return this.baseState.serverData.rounds[this.baseState.serverData.roundNumber].dealer }
    isItMyTurn() { return this.baseState.myPlayer.index == this.dealer() && !this.baseState.myPlayer.kibitzer }

    adjustDivSizes() { this.canvas.fixScoreWidth() }
    paintPlayers() { return true }
    paintCornerButtons() { return true }
    paintPreselected() { return true }
    paintNamePlates() { return true }
    highlightPlayer(player) { return player.index == this.dealer() }
    enablePoking(player) { return player.index == this.dealer() }
    cardEnabled(card) { return true }
    paintHandInteractables() { return true }
    checkIfShouldPlayPreselected() { return false }
    paintUpCard() { return true }
    upCardIsDown() { return this.pickedUp }
    cardClicked(card) {
        if (this.isItMyTurn()) {
            this.discard(card.getCard())
        } else if (card.preselection == -1) {
            card.preselection = this.baseState.preselected.length
            this.baseState.preselected.push(card)
        } else {
            this.baseState.clearPreselected(card.preselection)
        }
    }
    upCardIsDrawn() { return this.baseState.pickUpTimer == 1 }
    paintScoreSheet() { return true }

    discard(card) {
        this.client.emit('discard', card)
    }
}

export class ClientStateEuchrePlaying extends createClientStatePlaying(ClientStateEuchre) {
    constructor(key, client) {
        super(key, client)
    }

    paintUpCard() { return true }
    paintScoreSheet() { return true }

    showroundmessage() {
        let te = new TimerEntry(this.client.vars.messageTime)
        te.onFirstAction = () => {
            let result = this.baseState.serverData.roundResult
            switch (result) {
            case 0:
                this.baseState.message = 'Euchred!'
                break
            case 1:
                this.baseState.message = 'Made it!'
                break
            case 2:
                this.baseState.message = 'Made all!'
                break
            }
        }
        te.onLastAction = () => {
            this.baseState.message = ''
        }
        this.canvas.pushTimerEntry(te)
    }
}

export class ClientStateEuchrePostGame extends createClientStatePostGame(ClientStateEuchre) {
    constructor(key, client) {
        super(key, client)
    }
}

// canvas

function formatTrumpChoice(choice) {
    let color = 'black'
    let text = ''
    let width = 130
    let height = 50
    if (choice.pass) {
        text = 'pass'
    } else {
        width = 50
        color = ['black', 'red', 'black', 'red'][choice.suit]
        text = ['\u2663', '\u2666', '\u2660', '\u2665'][choice.suit]
        if (choice.alone) {
            width = 180
            text += ' alone'
        }
    }

    return {
        width: width,
        height: height,
        color: color,
        text: text,
    }
}

function drawEuchreScore(ctx, x, y, score, suits, img) {
    let u = img.height
    let x0 = x
    let y0 = y
    switch (score) {
        case undefined:
        case 0:
            drawCard(ctx, new Card(), x0, y0, 1, img, false, -1, undefined)
            break
        case 1:
            x0 = x + 0.1 * u
            y0 = y + 0.1 * u
            drawCard(ctx, new Card(6, 2 - suits), x0, y0, 1, img, false, -1, undefined)
            drawCard(ctx, new Card(), x0 - 0.1 * u, y0 - 0.135 * u, 1, img, false, -1, undefined, Math.PI * 0.25)
            break
        case 2:
            y0 = y + 0.1 * u
            drawCard(ctx, new Card(6, 2 - suits), x0, y0, 1, img, false, -1, undefined)
            drawCard(ctx, new Card(), x0, y0 - 0.25 * u, 1, img, false, -1, undefined, Math.PI * 0.5)
            break
        case 3:
            x0 = x + 0.2 * u
            drawCard(ctx, new Card(6, 2 - suits), x0, y0, 1, img, false, -1, undefined)
            drawCard(ctx, new Card(), x0 - 0.4 * u, y0, 1, img, false, -1, undefined)
            break
        case 4:
            drawCard(ctx, new Card(4, 1 + suits), x0, y0, 1, img, false, -1, undefined)
            break
        case 5:
            x0 = x + 0.1 * u
            y0 = y + 0.1 * u
            drawCard(ctx, new Card(6, 2 - suits), x0, y0, 1, img, false, -1, undefined)
            drawCard(ctx, new Card(4, 1 + suits), x0 - 0.1 * u, y0 - 0.135 * u, 1, img, false, -1, undefined, Math.PI * 0.25)
            break
        case 6:
            drawCard(ctx, new Card(6, 2 - suits), x0, y0, 1, img, false, -1, undefined)
            break
        case 7:
            x0 = x + 0.2 * u
            drawCard(ctx, new Card(6, 2 - suits), x0, y0, 1, img, false, -1, undefined)
            drawCard(ctx, new Card(4, 1 + suits), x0 - 0.4 * u, y0, 1, img, false, -1, undefined)
            break
        case 8:
            y0 = y + 0.25 * u
            drawCard(ctx, new Card(6, 2 - suits), x0, y0, 1, img, false, -1, undefined)
            drawCard(ctx, new Card(4, 1 + suits), x0, y0 - 0.5 * u, 1, img, false, -1, undefined, Math.PI * 0.5)
            break
        case 9:
            x0 = x + 0.2 * u
            y0 = y + 0.3 * u
            drawCard(ctx, new Card(6, 2 - suits), x0, y0, 1, img, false, -1, undefined)
            drawCard(ctx, new Card(4, 1 + suits), x0 - 0.35 * u, y0 - 0.5 * u, 1, img, false, -1, undefined, Math.PI * 0.25)
            break
        case 10:
        case 11:
        case 12:
        case 13:
            x0 = x + 0.35 * u
            drawCard(ctx, new Card(6, 2 - suits), x0, y0, 1, img, false, -1, undefined)
            drawCard(ctx, new Card(4, 1 + suits), x0 - 0.75 * u, y0, 1, img, false, -1, undefined)
            break
        default:
            break
    }
}

class EuchreCanvas extends CanvasBase {
    constructor(client) {
        super(client)
    }

    initialize() {
        if (this.initialized) {
            return
        }
        super.initialize()

        let thisCanvas = this

        // listeners
        this.robotsSpinner = document.getElementById("igRobots")
        this.robotsSpinner.addEventListener('change', () => { this.client.state.sendOptionsUpdate({ robots: this.robotsSpinner.value }) })

        igLobby.addEventListener('click', () => this.client.changeState('EUCHRE_PREGAME'))

        // filled out statically
        class EuchreScoreSheet extends PanelInteractable {
            constructor() {
                super(
                    document.getElementById('igScoreSheetEuchreContainer'),
                    document.getElementById('igScoreSheetEuchreCanvas'),
                    false
                )
                this.scoreMargin = 10
                this.margin = 30
            }

            paint() {
                super.paint()
                if (!this.isShown()) {
                    return
                }

                this.clear();
                this.fillContainer();

                let img = this.height() / 2 > this.margin + 1.707 * thisCanvas.client.vars.deckImg.height ? thisCanvas.client.vars.deckImg : thisCanvas.client.vars.deckImgSmall
                let x = this.width() / 2
                let y1 = 3 * this.margin + img.height / 2
                let y2 = this.height() / 2 + 3 * this.margin + img.height / 2
                let players = thisCanvas.client.state.baseState.serverData.players
                let myPlayer = thisCanvas.client.state.baseState.myPlayer
                let scores = [players[myPlayer.index].score, players[(myPlayer.index + 1) % players.length].score]

                drawText(this.ctx, 'Us', x, this.margin, 1, 1, font.bold, 'black')
                drawEuchreScore(this.ctx, x, y1, scores[0], 0, img)

                drawText(this.ctx, 'Them', x, this.height() / 2 + this.margin, 1, 1, font.bold, 'black')
                drawEuchreScore(this.ctx, x, y2, scores[1], 1, img)
            }
        }
        this.scoreSheet = new EuchreScoreSheet();
        this.scoreSheet.x = () => this.client.cachedWidth - (this.client.state.baseState.scoreWidth - this.scoreSheet.scoreMargin)
        this.scoreSheet.y = () => this.scoreSheet.scoreMargin
        this.scoreSheet.width = () => this.client.state.baseState.scoreWidth - 2 * this.scoreSheet.scoreMargin
        this.scoreSheet.height = () => this.chatArea.y() - 2 * this.scoreSheet.scoreMargin
        this.scoreSheet.container = () => this.client.state.scoreSheetContainer()
        this.scoreSheet.isShown = () => this.client.state.paintScoreSheet()

        // filled out dynamically
        this.trumpButtons = [];

        this.interactables = this.interactables.concat([
            [this.scoreSheet],
            this.trumpButtons
        ])
    }

    customPaintFirst() {
        super.customPaintFirst()
        this.paintUpCard()
        this.paintTrumpChoice()
        this.updateTrumpInteractables()
    }

    updateHostOptions() {
        if (!this.client.state.baseState.myPlayer) {
            return
        }
        if (!this.client.state.baseState.myPlayer.host) {
            this.robotsSpinner.disabled = true
            disableButton(this.igStart)
        } else {
            this.robotsSpinner.disabled = false
            enableButton(this.igStart)
        }
    }

    paintUpCard() {
        if (!this.client.state.paintUpCard()) {
            return;
        }

        let serverData = this.client.state.baseState.serverData
        let dealer = Math.min(serverData.roundNumber, serverData.rounds.length - 1)
        let player = serverData.players[serverData.rounds[dealer].dealer]
        let x0 = player.getUpCardX()
        let y0 = player.getUpCardY()

        drawCard(this.client.ctx, new Card(), x0 - 6, y0 - 6, smallCardScale, this.client.vars.deckImgSmall, false, -1, undefined);
        drawCard(this.client.ctx, new Card(), x0 - 4, y0 - 4, smallCardScale, this.client.vars.deckImgSmall, false, -1, undefined);
        drawCard(this.client.ctx, new Card(), x0 - 2, y0 - 2, smallCardScale, this.client.vars.deckImgSmall, false, -1, undefined);
        if (!this.client.state.upCardIsDrawn()) {
            let card
            if (this.client.state.upCardIsDown()) {
                card = new Card()
            } else {
                card = serverData.upCard
            }

            let x1 = player.getX() - (player.getJust() - 1) * this.client.vars.maxWid / 2
            let y1 = player.getY() - 40
            let t = this.client.state.baseState.pickUpTimer
            let x = x0 * (1 - t) + x1 * t
            let y = y0 * (1 - t) + y1 * t

            drawCard(this.client.ctx, card, x, y, smallCardScale, this.client.vars.deckImgSmall, false, -1, undefined);
        }
    }

    paintTrumpChoice() {
        if (!this.client.state.paintUpCard()) {
            return;
        }

        let serverData = this.client.state.baseState.serverData
        for (let player of serverData.players) {
            if (player.bidded) {
                let t = this.client.state.baseState.trumpTimer
                if (t > 0 && player.trumpChoice.pass) {
                    continue
                }

                let iRelToMe = player.index - this.client.state.baseState.myPlayer.index
                let startX = (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2 - 100 * Math.sin(2 * Math.PI * iRelToMe / serverData.players.length);
                let startY = this.client.cachedHeight / 2 - 50 + 100 * Math.cos(2 * Math.PI * iRelToMe / serverData.players.length);
                let endX = player.getTrumpX()
                let endY = player.getTrumpY()
                let bidX = startX * (1 - t) + endX * t;
                let bidY = startY * (1 - t) + endY * t;

                let format = formatTrumpChoice(player.trumpChoice)
                let height = format.height * (1 - t / 2)
                let width = Math.max(format.width * (1 - t * 0.666), height)

                this.client.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
                drawBox(this.client.ctx, bidX - width / 2, bidY - height / 2, width, height, height / 2, undefined)
                if (t == 0) {
                    this.client.ctx.strokeStyle = serverData.options.teams ? colors[player.team] : 'black';
                    this.client.ctx.lineWidth = serverData.options.teams ? 2 : 1;
                    this.client.ctx.lineWidth = 1;
                    drawText(this.client.ctx, format.text, bidX, bidY + 1, 1, 1, font.large, format.color);
                } else {
                    drawText(this.client.ctx, format.text, bidX, bidY, 1, 1, font.bold, format.color);
                }
            }
        }
    }

    updateTrumpInteractables() {
        let paintTrumpInteractables = this.client.state.paintTrumpInteractables()
        if (this.trumpButtons.length == 0 && paintTrumpInteractables) {
            this.makeTrumpInteractables()
        } else if (this.trumpButtons.length > 0 && !paintTrumpInteractables) {
            this.removeTrumpInteractables()
        }
    }

    makeTrumpInteractables() {
        this.trumpButtons.length = 0
        let trumpChoices = this.client.state.getTrumpChoices()
        let totalWidth = -10
        for (let choice of trumpChoices) {
            let format = formatTrumpChoice(choice)

            let button = document.createElement('button');
            button.innerHTML = `<p style="color:${format.color};">${format.text}</p>`
            button.classList.add(
                'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
                'font-bold', 'text-base', 'select-none', 'hover:bg-gray-300'
            );
            button.addEventListener('click', () => {
                this.client.state.makeTrumpChoice(choice)
                this.removeTrumpInteractables()
            })

            let height = format.height * 0.666
            let width = Math.max(format.width * 0.45, height)
            totalWidth += width + 10

            let wrappedButton = new WrappedDOMElement(button)
            wrappedButton.y = () => this.client.cachedHeight - 210 - 15
            wrappedButton.width = () => width
            wrappedButton.height = () => height
            wrappedButton.container = () => document.getElementById('inGameDiv')
            this.trumpButtons.push(wrappedButton)
        }
        let offset = -totalWidth / 2
        for (let button of this.trumpButtons) {
            let copy = offset
            button.x = () => (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2 + copy
            offset += button.width() + 10
        }
    }

    removeTrumpInteractables() {
        for (let button of this.trumpButtons) {
            button.dispose()
        }
        this.trumpButtons.length = 0
    }

    createPostGamePage() {
        return new EuchrePostGamePage(this)
    }

    loadPostGame(data) {
        //data.trumps = data.trumps.map(c => new Card(c.num, c.suit))

        this.pgPlayers = data.players
        this.pgTeams = data.teams
        this.pgRounds = data.rounds
        this.pgOptions = data.options

        this.postGamePage.setData(data)
    }
}

class EuchrePostGamePage extends PostGamePage {
    constructor(canvas) {
        super(canvas)
    }
}