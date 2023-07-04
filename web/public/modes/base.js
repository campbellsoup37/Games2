import { Card } from '../basics.js'

import { ClientState } from '../state.js'

import {
    font, colors, smallCardScale, getStringDimensions, drawText, drawBox, drawOval, createDeckImg, drawCard, drawLine, enableButton, disableButton
} from '../graphics_tools.js'

import {
    CanvasInteractable, WrappedDOMElement, PanelInteractable, CanvasButton, PlayerNamePlate, CanvasCard
} from '../interactable.js'

import { TimerEntry, OhcCanvas } from '../canvas.js'

import { ScoreSheet } from '../scoresheet.js'

import { PostGamePage } from '../postgame.js'

// states

export class ClientStateGameBase extends ClientState {
    constructor(key, baseKey, client, div, canvasClass) {
        super(key, client, div, canvasClass ? new canvasClass(client) : client.stateCache[baseKey].canvas)
        this.baseKey = baseKey
        this.initialize()
    }

    initialize() {
        this.baseState = this.key == this.baseKey ? this : this.client.stateCache[this.baseKey]
        this.serverData = Object()
        this.scoreWidth = 0
        this.sortScoresDescending = true
        this.myPlayer = undefined
        this.message = ''
        this.preselected = []
        this.decision = undefined
        this.decisionResponded = false

        this.takenTimer = 1
        this.lastTrickOwner = undefined

        this.cardJustPlayed = undefined

        this.pokeTime = 25000
    }

    enter(data) {
        this.canvas.initialize()
        super.enter(data)
    }

    clearPreselected(index) {
        for (let i = index; i < this.baseState.preselected.length; i++) {
            this.baseState.preselected[i].preselection = -1
        }
        this.baseState.preselected.splice(index, this.baseState.preselected.length - index)
    }

    shiftPreselected(index) {
        this.baseState.preselected.shift()
        for (const inter of this.baseState.preselected) {
            inter.preselection--
        }
    }

    clickOnNothing() {
        this.clearPreselected(0)
    }

    updateServerData(data) {
        console.log('server sent ', data)
        let specialUpdateHandling = []

        function update(A, B, depth) {
            if (Array.isArray(B)) {
                for (let k = 0; k < B.length; k++) {
                    //console.log(depth, 'array updating', k)
                    let v = B[k]
                    if (k >= A.length || typeof v !== 'object' || v === null) {
                        A[k] = v
                    } else {
                        update(A[k], v, depth + 1)
                    }
                }
            } else {
                for (let [k, v] of Object.entries(B)) {
                    //console.log(depth, 'object updating', k)
                    if (depth == 0) {
                        specialUpdateHandling.push([`updateServerData_${k}`, 'update', B])
                    }
                    if (A[k] === undefined || typeof v !== 'object' || v === null || (Array.isArray(v) && v.length == 0)) {
                        A[k] = v
                    } else {
                        update(A[k], v, depth + 1)
                    }
                }
            }
        }
        function remove(A, B, depth) {
            for (let [k, v] of Object.entries(B)) {
                if (depth == 0) {
                    specialUpdateHandling.push([`updateServerData_${k}`, 'remove', B])
                }
                if (!(k in A)) {
                    continue
                }
                if (Array.isArray(v)) {
                    for (let i of v) {
                        A[k][i] = undefined
                    }
                    if (Array.isArray(A[k])) {
                        A[k] = A[k].filter(x => x !== undefined)
                    }
                } else if (!v) {
                    delete A[k]
                } else {
                    remove(A[k], v, depth + 1)
                }
            }
        }

        for (let diff of data) {
            if (diff.type == 'update') {
                update(this.baseState.serverData, diff.data, 0)
                if (diff.args) {
                    for (let [k, v] of Object.entries(diff.args)) {
                        specialUpdateHandling.push([`updateServerDataArgs_${k}`, 'update', v])
                    }
                }
            } else if (diff.type == 'remove') {
                remove(this.baseState.serverData, diff.data, 0)
                if (diff.args) {
                    for (let [k, v] of Object.entries(diff.args)) {
                        specialUpdateHandling.push([`updateServerDataArgs_${k}`, 'remove', v])
                    }
                }
            }
        }

        // Do the special updates after we finish updating the serverData object completely
        for (let entry of specialUpdateHandling) {
            if (entry[0] in this.client.state) {
                this.client.state[entry[0]](entry[1], entry[2])
            }
        }

        console.log('current state', this.baseState.serverData)
    }

    updateServerData_state(type, diff) {
        this.client.changeState(this.baseState.serverData.state)
    }

    updateServerData_players(type, diff) {
        for (let list of [this.baseState.serverData.players, this.baseState.serverData.kibitzers]) {
            for (let player of list) {
                if (player.id !== undefined && player.id === this.client.vars.username) {
                    this.baseState.myPlayer = player
                }
            }
        }
        this.canvas.kibitzerCheckBox.checked = this.baseState.myPlayer && this.baseState.myPlayer.kibitzer

        this.canvas.updatePlayerPositions()
        let myIndex = this.baseState.myPlayer.index
        if (type == 'update' && diff.players[myIndex] && diff.players[myIndex].hand && diff.players[myIndex].hand.length > 0) {
            this.canvas.updateHandInteractables()
        }
    }

    updateServerDataArgs_playersRandomized(type, diff) {
        this.canvas.updatePlayerPositions(true)
    }

    updateServerDataArgs_move(type, diff) {
        if (!diff.human) {
            this.pushBasicTimer(() => { }, this.client.vars.robotDelay, true)
        }
    }

    adjustDivSizes() { }
    paintHotdog() { return false }
    paintTeamInfo() { return false }
    paintTrick() { return false }
    paintLastTrick() { return false }
    paintPlayers() { return false }
    paintTaken() { return false }
    paintCornerButtons() { return false }
    paintPostGame() { return false }
    paintPreselected() { return false }
    paintMessage() { return this.baseState.message != '' }
    chatWidth() { return this.baseState.scoreWidth - 20 }
    nameplatesAboveChat() { return false }
    paintNamePlates() { return false }
    enablePoking(player) { return false }
    highlightPlayer(player) { return false }
    scoreSheetContainer() { return document.getElementById('inGameDiv') }
    paintScoreSheet() { return false }
    scoreSheetPlayers() { return this.baseState.serverData.players }
    scoreSheetTeams() { return this.baseState.serverData.teams }
    scoreSheetRounds() { return this.baseState.serverData.rounds }
    scoreSheetOptions() { return this.baseState.serverData.options }
    cardSelected(card) { return card.preselection != -1 }
    cardEnabled(card) { return false }
    cardClicked(card) { }
    paintShowCardButton() { return false }
    paintHandInteractables() { return false }
    paintBidAndDealerChips() { return false }
    hideCard(card) { return false }
    enableClaimButton() { return false }

    isItMyTurn() { return this.baseState.myPlayer.index == this.baseState.serverData.turn && !this.baseState.myPlayer.kibitzer }

    // server entry points
    gamestate(data) {
        this.pushBasicTimer(() => this.updateServerData(data), 0, false)
    }

    kick(data) {
        // not on timer
        document.location = this.client.vars.baseUrl
    }

    poke() {
        this.client.vars.pokeSound.play()
    }

    chat(data) {
        this.canvas.chat(data)
    }

    showroundmessage() { }

    end(data) {
        this.showMessage(this.baseState.serverData.players[data.index].name + ' is ending the game.')
    }

    claimresult(data) {
        this.showMessage('Claim ' + (data.accepted ? 'accepted.' : 'rejected.'))
    }

    // client internal
    leaveGame() {
        this.client.emit('leavegame')
    }

    sendOptionsUpdate(options) {
        let fullOptions = this.baseState.serverData.options
        for (let [key, value] of Object.entries(options)) {
            fullOptions[key] = value
        }
        this.client.emit('options', fullOptions)
    }

    sendPlayerUpdate() {
        this.client.emit('player', {
            id: this.baseState.myPlayer.id,
            name: this.baseState.myPlayer.name,
            kibitzer: this.baseState.myPlayer.kibitzer
        })
    }

    sendPoke(index) {
        this.client.emit('poke', index)
    }

    sendChat(text) {
        this.client.emit('chat', text)
    }

    replaceWithRobot(index) {
        this.client.emit('replacewithrobot', index)
    }

    makeClaim() {
        this.client.emit('claim')
    }

    makeDecision(index) {
        this.baseState.decisionResponded = true
        this.client.emit('decision', { name: this.baseState.decision.name, choice: index })
    }

    requestEndGame() {
        this.client.emit('end')
    }

    download() {
        window.open(`${this.client.vars.baseUrl}/cached_games/${this.client.vars.autojoinId}.ohw`, 'Download');
    }

    showMessage(text) {
        let te = new TimerEntry(this.client.vars.messageTime)
        te.onFirstAction = () => {
            this.baseState.message = text
        }
        te.onLastAction = () => {
            this.baseState.message = ''
        }
        this.canvas.pushTimerEntry(te)
    }
}

export function createClientStatePreGame(base) {
    class ClientStatePreGame extends base {
        constructor(key, client) {
            super(key, client, document.getElementById('preGameDiv'))
        }

        initialize() {
            this.baseState = this.client.stateCache[this.baseKey]
        }

        enter(data) {
            super.enter(data)
            this.baseState.scoreWidth = 0
            document.getElementById("doubleDeckOptionsRow").style.display = 'table-row'
            document.getElementById("teamsOptionsRow").style.display = 'table-row'
            document.getElementById("oregonOptionsRow").style.display = 'table-row'
        }

        chatWidth() { return 430 }
        nameplatesAboveChat() { return true }
        paintNamePlates() { return true }
        highlightPlayer(player) { return player.host }

        // client internal
        startGame() {
            this.client.emit('start')
        }

        reteam(index, team) {
            this.client.emit('reteam', { index: index, team: team })
        }

        scrambleTeams() {
            this.client.emit('scrambleteams')
        }
    }
    return ClientStatePreGame
}

export function createClientStatePlaying(base) {
    class ClientStatePlaying extends base {
        constructor(key, client) {
            super(key, client, document.getElementById('inGameDiv'))
        }

        initialize() {
            this.baseState = this.client.stateCache[this.baseKey]
            this.canPlay = undefined
        }

        animatePlay(index) {
            let animateTe = new TimerEntry(this.client.vars.animationTime)
            animateTe.onAction = () => {
                let t = Math.min(animateTe.elapsedTime / this.client.vars.animationTime, 1)
                this.baseState.serverData.players[index].trickTimer = t
            }
            this.canvas.pushTimerEntry(animateTe, true)
        }

        animateTrickTake(winner) {
            let animateTe = new TimerEntry(this.client.vars.animationTime);
            animateTe.onFirstAction = () => {
                for (let player of this.baseState.serverData.players) {
                    player.trickTimer = 0
                }
                this.baseState.takenTimer = 0
                this.baseState.lastTrickOwner = this.baseState.serverData.players[winner]
            }
            animateTe.onAction = () => {
                this.baseState.takenTimer = Math.min(animateTe.elapsedTime / this.client.vars.animationTime, 1);
            }
            animateTe.onLastAction = () => {
                for (let player of this.baseState.serverData.players) {
                    player.trickRad = -1
                }
            }
            this.canvas.pushTimerEntry(animateTe, true);

            let stayTe = new TimerEntry(this.client.vars.trickStayTime);
            this.canvas.pushTimerEntry(stayTe, true);
        }

        updateServerData_players(type, diff) {
            super.updateServerData_players(type, diff)

            let state = this
            function handlePlay(index, player) {
                if (player.trick && player.trick.num != 0) {
                    state.animatePlay(index)
                }
                if (type == 'remove' && player.hand && index == state.baseState.myPlayer.index && !state.baseState.myPlayer.kibitzer) {
                    state.canvas.cardInteractables.splice(player.hand[0], 1)
                }
            }
            if (Array.isArray(diff.players)) {
                for (let i = 0; i < diff.players.length; i++) {
                    handlePlay(i, diff.players[i])
                }
            } else {
                for (let [i, player] of Object.entries(diff.players)) {
                    handlePlay(i, player)
                }
            }
        }

        updateServerDataArgs_trickWinner(type, args) {
            this.animateTrickTake(args)
        }

        updateServerDataArgs_canPlay(type, args) {
            this.canPlay = args
        }

        canPlayCard(card) {
            if (!this.canPlay) {
                return false
            }
            return this.canPlay.some(c => c.num == card.num && c.suit == card.suit)
        }

        checkIfShouldPlayPreselected() {
            return this.isItMyTurn() && this.canPlay !== undefined
        }

        playCard(canvasCard) {
            this.baseState.cardJustPlayed = canvasCard.index()
            let card = canvasCard.getCard()
            this.canPlay = undefined
            this.client.emit('play', { card: { num: card.num, suit: card.suit } })
        }

        enter(data) {
            super.enter(data)
            let leader = this.baseState.serverData.players[this.baseState.serverData.leader]
            if (leader.taken == 0) {
                this.baseState.takenTimer = 0
                this.baseState.lastTrickOwner = undefined
            } else {
                this.baseState.takenTimer = 1
                this.baseState.lastTrickOwner = leader
            }
        }

        adjustDivSizes() { this.canvas.fixScoreWidth() }
        paintTrick() { return true }
        paintLastTrick() { return this.baseState.lastTrickOwner && this.baseState.takenTimer == 1 }
        paintPlayers() { return true }
        paintTaken() { return true }
        paintCornerButtons() { return true }
        paintPreselected() { return true }
        paintNamePlates() { return true }
        highlightPlayer(player) { return player.index == this.baseState.serverData.turn }
        enablePoking(player) { return this.highlightPlayer(player) }
        paintBidAndDealerChips() { return false }
        paintScoreSheet() { return true }
        cardEnabled(card) {
            if (this.baseState.serverData.turn == this.baseState.myPlayer.index && this.baseState.myPlayer.trick.num == 0) {
                return this.canPlayCard(card.getCard())
            } else {
                return true
            }
        }
        cardClicked(card) {
            if (this.baseState.serverData.turn == this.baseState.myPlayer.index && this.baseState.myPlayer.trick.num == 0) {
                if (this.baseState.preselected.length == 0) {
                    this.playCard(card)
                } else {
                    return
                }
            } else {
                if (card.preselection == -1) {
                    card.preselection = this.baseState.preselected.length
                    this.baseState.preselected.push(card)
                } else {
                    this.baseState.clearPreselected(card.preselection)
                }
            }
        }
        paintHandInteractables() { return true }
        enableClaimButton() { return true }
    }
    return ClientStatePlaying
}

export function createClientStatePostGame(base) {
    class ClientStatePostGame extends base {
        constructor(key, client) {
            super(key, client, document.getElementById('postGameDiv'))
        }

        initialize() {
            this.baseState = this.client.stateCache[this.baseKey]
        }

        adjustDivSizes() {
            this.canvas.fixScoreWidth()
            this.canvas.fixPostGameWidth()
        }

        updateServerDataArgs_postGameData(type, args) {
            this.canvas.loadPostGame(args);
            enableButton(document.getElementById('igLobby'))
            enableButton(document.getElementById('igDownload'))
        }

        paintPostGame() { return true }
        paintScoreSheet() { return true }
        scoreSheetContainer() { return document.getElementById('postGameDiv') }
        scoreSheetPlayers() { return this.canvas.pgPlayers }
        scoreSheetTeams() { return this.canvas.pgTeams }
        scoreSheetRounds() { return this.canvas.pgRounds }
        scoreSheetOptions() { return this.canvas.pgOptions }

        enter(data) {
            super.enter(data)

            if (data) {
                this.baseState.scoreWidth = 450
                this.client.vars.autojoinId = undefined
                disableButton(document.getElementById('igLobby'))
                disableButton(document.getElementById('igDownload'))
                this.canvas.loadPostGame(data)
                this.baseState.myPlayer = undefined

            }
        }

        // client internal
        leaveGame() {
            if (this.client.vars.autojoinId) {
                super.leaveGame()
            } else {
                document.location = this.client.vars.baseUrl
            }
        }
    }
    return ClientStatePostGame
}

export class CanvasBase extends OhcCanvas {
    constructor(client) {
        super(client, false)
        this.minChatHeight = 200
        this.maxChatHeight = 200
        this.cardSeparation = 40
        this.handYOffset = 105
        this.selectedCardYOffset = 50
        this.takenXSeparation = 10
        this.takenYSeparation = 5
        this.lastTrickSeparation = 20

        this.initialized = false
    }

    initialize() {
        if (this.initialized) {
            return
        }

        this.setBackground(document.getElementById('background'));

        let thisCanvas = this

        // listeners
        let igName = document.getElementById("igName")
        function changeName() {
            if (igName.value.length == 0) {
                return
            }
            thisCanvas.client.state.baseState.myPlayer.name = igName.value
            thisCanvas.client.state.sendPlayerUpdate()
        }
        igName.addEventListener('keydown', e => {
            if (e.keyCode == 13) {
                changeName()
            }
        })
        document.getElementById("igChangeName").addEventListener('click', () => {
            changeName()
        })

        this.kibitzerCheckBox = document.getElementById("igKibitzer")
        this.kibitzerCheckBox.addEventListener('change', () => {
            this.client.state.baseState.myPlayer.kibitzer = this.kibitzerCheckBox.checked
            this.client.state.sendPlayerUpdate()
        })

        this.igStart = document.getElementById("igStart")
        this.igStart.addEventListener('click', () => this.client.state.startGame())

        document.getElementById("igBack").addEventListener('click', () => this.client.state.leaveGame())

        document.getElementById("igBack3").addEventListener('click', () => this.client.state.leaveGame())
        document.getElementById("igDownload").addEventListener('click', () => this.client.state.download())

        // filled out statically
        class LastTrick extends CanvasCard {
            paint() {
                super.paint();
                if (this.isMoused()) {
                    let players = thisCanvas.client.state.baseState.serverData.players
                    let k = 0
                    for (let player of players) {
                        if (player.lastTrick.num == 0) {
                            continue
                        }

                        let x0 = Math.min(
                            this.xCenter() + 50,
                            thisCanvas.client.cachedWidth - thisCanvas.client.state.baseState.scoreWidth
                                - thisCanvas.lastTrickSeparation * (players.length - 1) - thisCanvas.client.vars.deckImg.width / 2 - 10
                        );
                        let y0 = Math.max(this.yCenter(), thisCanvas.client.vars.deckImg.height / 2 + 10);
                        drawCard(
                            thisCanvas.client.ctx, player.lastTrick,
                            x0 + thisCanvas.lastTrickSeparation * k, y0,
                            1, thisCanvas.client.vars.deckImgSmall, false, -1, undefined
                        );
                        k++
                    }
                }
            }
        }
        this.lastTrick = new LastTrick(new Card(), smallCardScale, this.client.vars.deckImgSmall, this.client.ctx);
        this.lastTrick.player = () => this.client.state.baseState.lastTrickOwner
        this.lastTrick.xCenter = () => this.lastTrick.player().getTakenX() + this.takenXSeparation * (this.lastTrick.player().taken - 1)
        this.lastTrick.yCenter = () => this.lastTrick.player().getTakenY() + this.takenYSeparation * (this.lastTrick.player().taken - 1)
        this.lastTrick.isShown = () => this.client.state.paintLastTrick()
        this.lastTrick.isEnabled = this.lastTrick.isShown

        this.decisionButtons = [];

        let leaveB = document.createElement('button');
        leaveB.innerHTML = 'Leave table';
        leaveB.classList.add(
            'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
            'font-bold', 'text-md', 'select-none', 'hover:bg-gray-300'
        );
        leaveB.addEventListener('click', () => this.client.state.leaveGame());
        this.leaveButton = new WrappedDOMElement(leaveB);
        this.leaveButton.x = () => 10;
        this.leaveButton.y = () => this.client.cachedHeight - (this.leaveButton.height() + 10);
        this.leaveButton.width = () => 105;
        this.leaveButton.height = () => 32;
        this.leaveButton.container = () => document.getElementById('inGameDiv');
        this.leaveButton.isShown = () => this.client.state.paintCornerButtons()

        let endB = document.createElement('button');
        endB.innerHTML = 'End game';
        endB.classList.add(
            'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
            'font-bold', 'text-md', 'select-none', 'hover:bg-gray-300'
        );
        endB.addEventListener('click', () => this.client.state.requestEndGame());
        this.endButton = new WrappedDOMElement(endB);
        this.endButton.x = () => 10;
        this.endButton.y = () => this.client.cachedHeight - 2 * (this.leaveButton.height() + 10);
        this.endButton.width = () => 105;
        this.endButton.height = () => 32;
        this.endButton.container = () => document.getElementById('inGameDiv');
        this.endButton.isEnabled = () => this.client.state.baseState.myPlayer && this.client.state.baseState.myPlayer.host;
        this.endButton.isShown = () => this.client.state.paintCornerButtons()

        let claimB = document.createElement('button');
        claimB.innerHTML = 'Claim';
        claimB.classList.add(
            'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
            'font-bold', 'text-md', 'select-none', 'hover:bg-gray-300'
        );
        claimB.addEventListener('click', () => this.client.state.makeClaim())
        this.claimButton = new WrappedDOMElement(claimB);
        this.claimButton.x = () => 10;
        this.claimButton.y = () => this.client.cachedHeight - 3 * (this.leaveButton.height() + 10);
        this.claimButton.width = () => 105;
        this.claimButton.height = () => 32;
        this.claimButton.container = () => document.getElementById('inGameDiv');
        this.claimButton.isEnabled = () => this.client.state.enableClaimButton()
        this.claimButton.isShown = () => this.client.state.paintCornerButtons()

        let chatF = document.createElement('input');
        chatF.type = 'text';
        chatF.autocomplete = 'off';
        chatF.classList.add(
            'bg-white', 'rounded-lg', 'border', 'border-black', 'text-sm', 'p-2'
        );
        chatF.addEventListener('keydown', e => {
            if (e.keyCode == 13) {
                this.client.state.sendChat(chatF.value);
                chatF.value = '';
            }
        });
        this.chatField = new WrappedDOMElement(chatF);
        this.chatField.x = () => this.client.cachedWidth - this.chatField.width() - 10;
        this.chatField.y = () => this.client.cachedHeight - this.chatField.height() - 10;
        this.chatField.width = () => this.client.state.chatWidth()
        this.chatField.height = () => 32;
        this.chatField.container = () => this.client.state.div

        let chatA = document.createElement('textarea');
        chatA.readOnly = true;
        chatA.style.resize = 'none';
        chatA.style.overflowY = 'auto';
        chatA.classList.add(
            'bg-white', 'rounded-lg', 'border', 'border-black', 'text-sm', 'p-2'
        );
        this.chatArea = new WrappedDOMElement(chatA);
        this.chatArea.x = () => this.client.cachedWidth - this.chatArea.width() - 10;
        this.chatArea.y = () => {
            let minY = this.client.cachedHeight - this.chatField.height() - 15 - this.maxChatHeight;
            let divAbove = 10
            if (this.client.state.paintTeamInfo()
                && this.client.state.baseState.serverData
                && this.client.state.baseState.serverData.options
                && this.client.state.baseState.serverData.options.teams) {
                divAbove += this.teamInfo.y() + this.teamInfo.height()
            } else if (this.client.state.paintHotdog()) {
                divAbove += this.hotdog.y() + this.hotdog.height()
            }
            let maxNamePlate = 0
            if (this.client.state.nameplatesAboveChat()) {
                maxNamePlate = Math.max(...this.namePlates.map(np => np.player.pov() ? 0 : np.y() + np.height() + 10))
            }
            return Math.max(minY, divAbove, maxNamePlate);
        }
        this.chatArea.width = () => this.client.state.chatWidth()
        this.chatArea.height = () => this.client.cachedHeight - this.chatArea.y() - this.chatField.height() - 15;
        this.chatArea.container = () => this.client.state.div

        this.divider = new CanvasInteractable();
        this.divider.draggable = true;
        this.divider.x = () => this.client.cachedWidth - this.client.state.baseState.scoreWidth - 2;
        this.divider.y = () => 0;
        this.divider.width = () => 4;
        this.divider.height = () => this.client.cachedHeight;
        this.divider.cursor = () => 'w-resize';
        this.divider.dragTo = (x, y) => {
            this.client.state.baseState.scoreWidth = Math.max(400, Math.min(this.client.cachedWidth / 2, this.client.cachedWidth - x));
        };
        this.divider.paint = () => {
            this.client.ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
            drawLine(this.client.ctx,
                this.divider.x() + this.divider.width() / 2,
                this.divider.y(),
                this.divider.x() + this.divider.width() / 2,
                this.divider.y() + this.divider.height());
        }

        this.miscInteractables = [
            this.leaveButton,
            this.endButton,
            this.claimButton,
            this.chatField,
            this.chatArea,
            this.divider
        ];

        this.postGamePage = this.createPostGamePage();

        // filled out dynamically
        this.namePlates = [];
        this.robotButtons = [];
        this.cardInteractables = [];

        this.interactables = [
            this.cardInteractables,
            this.namePlates,
            [this.lastTrick],
            this.decisionButtons,
            this.miscInteractables,
            this.robotButtons,
            [this.postGamePage]
        ];

        this.initialized = true
    }

    createPostGamePage() {
        return new PostGamePage(this)
    }

    // TODO ?
    //cleanup() {
    //    this.namePlates.length = 0;
    //    this.cardInteractables.length = 0;
    //    this.bidButtons.length = 0;
    //    this.timerQueue.clear();
    //}

    backgroundCenterX() {
        return (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2;
    }

    scoreSheetPlayers() {
        let players = this.client.state.scoreSheetPlayers()
        if (players) {
            return players
        }
        return []
    }

    scoreSheetTeams() {
        let teams = this.client.state.scoreSheetTeams()
        if (teams) {
            return teams
        }
        return []
    }

    scoreSheetRounds() {
        let rounds = this.client.state.scoreSheetRounds()
        if (rounds) {
            return rounds
        }
        return []
    }

    scoreSheetOptions() {
        let options = this.client.state.scoreSheetOptions()
        if (options) {
            return options
        }
        return Object()
    }

    clickOnNothing() {
        this.client.state.clickOnNothing()
    }

    customPaintFirst() {
        this.updateHostOptions()
        this.updateHandInteractables()
        this.updateDecision()
        this.adjustDivSizes();
        this.paintPlayers();
        this.paintTaken();
    }

    customPaintLast() {
        this.paintTrick();
        this.paintPreselected();
        this.paintMessage();

        this.paintFrameRate();
    }

    updateHostOptions() { }

    adjustDivSizes() {
        this.client.state.adjustDivSizes()
    }

    fixScoreWidth() {
        let baseState = this.client.state.baseState
        if (baseState.scoreWidth == 0) {
            baseState.scoreWidth = 450
        }
        baseState.scoreWidth = Math.max(400, Math.min(this.client.cachedWidth / 2, baseState.scoreWidth))
    }

    fixPostGameWidth() {
        let leftWidth = this.client.cachedWidth - this.client.state.baseState.scoreWidth;
        igPgLeft.style.width = leftWidth + 'px';
        igPgRight.style.width = this.client.state.baseState.scoreWidth + 'px';
    }

    paintPlayers() {
        if (!this.client.state.paintPlayers()) {
            return;
        }

        let baseState = this.client.state.baseState

        for (const player of baseState.serverData.players) {
            let x = player.getX();
            let y = player.getY();
            let pos = player.getJust();

            let separation = 10;

            if (player.id != baseState.myPlayer.id) {
                let h = player.hand.length;
                let yOffset = 40;
                for (let i = 0; i < h; i++) {
                    drawCard(
                        this.client.ctx,
                        player.hand[i],
                        x + i * separation - (h - 1) * separation / 2 - (pos - 1) * this.client.vars.maxWid / 2,
                        y - yOffset,
                        smallCardScale, this.client.vars.deckImgSmall, false, -1, undefined
                    )
                }
            }
        }
    }

    paintTrick() {
        if (!this.client.state.paintTrick()) {
            return;
        }

        let myPlayer = this.client.state.baseState.myPlayer
        let serverData = this.client.state.baseState.serverData
        let N = serverData.players.length;
        for (let i = 0; i < N; i++) {
            let iRelToLeader = (serverData.leader + i) % N;
            let iRelToMe = (iRelToLeader - myPlayer.index + N) % N;
            let player = serverData.players[iRelToLeader];
            if (player.trick.num != 0) {
                if (player.trickRad == -1) {
                    let baseTrickRad = N >= 8 ? 110 : 70
                    player.trickRad = baseTrickRad + 10 * Math.random()
                }

                let startX = player.getX();
                let startY = player.getY();

                if (player.id == myPlayer.id && this.client.state.baseState.cardJustPlayed !== undefined) {
                    startX = (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2 + this.client.state.baseState.cardJustPlayed * this.cardSeparation
                        - (myPlayer.hand.length) * this.cardSeparation / 2;
                    startY = this.client.cachedHeight - this.handYOffset;
                }

                let endX = (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2
                    - player.trickRad * Math.sin(2 * Math.PI * iRelToMe / N);
                let endY = this.client.cachedHeight / 2 - 50
                    + player.trickRad * Math.cos(2 * Math.PI * iRelToMe / N);

                let x = player.trickTimer * endX + (1 - player.trickTimer) * startX;
                let y = player.trickTimer * endY + (1 - player.trickTimer) * startY;
                if (player.trickTimer > 0) {
                    drawCard(
                        this.client.ctx,
                        player.trick,
                        x, y, 1,
                        this.client.vars.deckImgSmall, false, -1,
                        serverData.options.teams && this.client.vars.preferences.teamColorTrick ? colors[player.team] : undefined
                    );
                }
            }
        }
    }

    paintPreselected() {
        if (!this.client.state.paintPreselected()) {
            return;
        }

        for (const inter of this.client.state.baseState.preselected) {
            drawText(this.client.ctx,
                inter.preselection + 1,
                inter.x() + 20,
                inter.y() - 20,
                1, 1, font.bold, 'blue'
            );
        }
    }

    paintTaken() {
        if (!this.client.state.paintTaken()) {
            return;
        }

        let thisCanvas = this
        function paintHelper(player, j, t) {
            let takenX = player.getTakenX();
            let takenY = player.getTakenY();

            let x = takenX + thisCanvas.takenXSeparation * j;
            let y = takenY + thisCanvas.takenYSeparation * j;
            x = t * x + (1 - t) * (thisCanvas.client.cachedWidth - thisCanvas.client.state.baseState.scoreWidth) / 2;
            y = t * y + (1 - t) * thisCanvas.client.cachedHeight / 2;

            drawCard(thisCanvas.client.ctx, new Card(), x, y, smallCardScale, thisCanvas.client.vars.deckImgSmall, false, -1, undefined);
        }

        for (const player of this.client.state.baseState.serverData.players) {
            for (let j = 0; j < player.taken; j++) {
                paintHelper(player, j, 1)
            }
        }

        let t = this.client.state.baseState.takenTimer
        let winner = this.client.state.baseState.lastTrickOwner
        if (winner && t < 1 && !this.lastTrick.isShown()) {
            paintHelper(winner, winner.taken ? winner.taken : 0, t)
        }
    }

    paintMessage() {
        if (!this.client.state.paintMessage()) {
            return
        }

        let x = (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2;
        let y = this.client.cachedHeight / 2;
        let dims = getStringDimensions(this.client.state.baseState.message, font.basic);
        this.client.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        drawBox(this.client.ctx,
            x - dims[0] / 2 - 20,
            y - dims[1] / 3 - 12,
            dims[0] + 40,
            dims[1] + 20,
            15
        );
        drawText(this.client.ctx, this.client.state.baseState.message, x, y, 1, 1, font.basic, 'black');
    }

    paintFrameRate() {
        if (!this.client.vars.preferences.showFps) {
            return;
        }

        if (this.frameTimes === undefined) {
            this.frameTimes = [];
            this.framePointer = 0;
        }
        let time = new Date().getTime();
        if (this.frameTimes.length == 100) {
            let total = time - this.frameTimes[this.framePointer];
            this.frameTimes[this.framePointer] = time;

            let fps = (1000 * 100 / total).toFixed(2);
            drawText(this.client.ctx, 'FPS: ' + fps, this.client.cachedWidth - this.client.state.baseState.scoreWidth - 20, 20, 2, 1, font.basic, 'red');
        } else {
            this.frameTimes.push(time);
        }
        this.framePointer = (this.framePointer + 1) % 100;
    }

    newGameReset() {
        this.postGamePage.clearData();
    }

    updatePlayerPositions(force) {
        if (!force && this.namePlates.length == this.client.state.baseState.serverData.players.length) {
            return
        }

        this.setPlayerExtraFunctions()
        this.resetNamePlatesAndRobotButtons()
    }

    setPlayerExtraFunctions() {
        let players = this.client.state.baseState.serverData.players
        let myPlayer = this.client.state.baseState.myPlayer

        let N = players.length
        let cut1 = Math.floor((N - 1) / 3)
        let cut2 = 2 * cut1
        if ((N - 1) % 3 != 0) {
            cut2++
        }
        if ((N - 1) % 3 == 2) {
            cut1++
        }

        let myIndex = Math.min(myPlayer.index, N - 1)
        for (const player of players) {
            let index = (player.index - myIndex + N - 1) % N;
            if (index < cut1) {
                // Left
                player.getX = () => 10
                player.getY = () => this.client.cachedHeight * (cut1 - index) / (cut1 + 1)
                player.getJust = () => 0
                player.getTakenX = () => player.getX() + 20
                player.getTakenY = () => player.getY() + 50
                player.getPassX = () => player.getX() + 250
                player.getPassY = () => player.getY()
                player.getTrumpX = () => player.getX() + this.client.vars.maxWid - 20
                player.getTrumpY = () => player.getY() + 30
                player.getUpCardX = () => player.getX() + this.client.vars.maxWid + 10 + this.client.vars.deckImgSmall.width / 2
                player.getUpCardY = () => player.getY()
                player.pov = () => false;
            } else if (index < cut2) {
                // Top
                player.getX = () => (this.client.cachedWidth - this.client.state.baseState.scoreWidth) * (index - cut1 + 1) / (cut2 - cut1 + 1)
                player.getY = () => 85
                player.getJust = () => 1
                player.getTakenX = () => player.getX() + 120
                player.getTakenY = () => player.getY() - 35
                player.getPassX = () => player.getX()
                player.getPassY = () => player.getY() + 100
                player.getTrumpX = () => player.getX()
                player.getTrumpY = () => player.getY() + 30
                player.getUpCardX = () => player.getX()
                player.getUpCardY = () => player.getY() + 40 + this.client.vars.deckImgSmall.height / 2
                player.pov = () => false
            } else if (index < N - 1) {
                // Right
                player.getX = () => this.client.cachedWidth - this.client.state.baseState.scoreWidth - 10
                player.getY = () => this.client.cachedHeight * (index - cut2 + 1) / (N - 1 - cut2 + 1)
                player.getJust = () => 2
                player.getTakenX = () => player.getX() - 90
                player.getTakenY = () => player.getY() + 50
                player.getPassX = () => player.getX() - 250
                player.getPassY = () => player.getY()
                player.getTrumpX = () => player.getX() - this.client.vars.maxWid + 20
                player.getTrumpY = () => player.getY() + 30
                player.getUpCardX = () => player.getX() - this.client.vars.maxWid - 10 - this.client.vars.deckImgSmall.width / 2
                player.getUpCardY = () => player.getY()
                player.pov = () => false
            } else {
                // Bottom (player)
                player.getX = () => (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2
                player.getY = () => this.client.cachedHeight - 20
                player.getJust = () => 1
                player.getTakenX = () => {
                    let data = this.client.state.baseState.serverData
                    if (data.rounds[data.roundNumber] === undefined) {
                        return player.getX() + 280
                    } else {
                        return player.getX() + Math.max(
                            280,
                            (data.rounds[data.roundNumber].handSize - 1) * this.cardSeparation / 2 + this.client.vars.deckImg.width / 2 + 20
                        )
                    }
                }
                player.getTakenY = () => player.getY() - 50
                player.getPassX = () => player.getX()
                player.getPassY = () => player.getY() - 300
                player.getTrumpX = () => player.getX() + 200
                player.getTrumpY = () => player.getY() + 3
                player.getUpCardX = () => player.getX() + 200
                player.getUpCardY = () => player.getY() - 50
                player.pov = () => true
            }

            player.trickRad = -1
            player.trickTimer = 0

            player.pokeTime = undefined
        }
    }

    resetNamePlatesAndRobotButtons() {
        let players = this.client.state.baseState.serverData.players
        let myPlayer = this.client.state.baseState.myPlayer

        this.namePlates.length = 0
        for (const button of this.robotButtons) {
            button.dispose()
        }
        this.robotButtons.length = 0

        for (const player of players) {
            let nameplate = new PlayerNamePlate(player, this.client)
            nameplate.width = () => this.client.vars.maxWid
            this.namePlates.push(nameplate)

            let button = document.createElement('button')
            button.innerHTML = 'Robot'
            button.classList.add(
                'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
                'font-bold', 'text-sm', 'select-none', 'hover:bg-gray-300'
            )
            button.addEventListener('click', () => this.client.state.replaceWithRobot(player.index))

            let inter = new WrappedDOMElement(button)
            inter.x = () => player.getX() + this.client.vars.maxWid * (1 - player.getJust()) / 2 - 30
            inter.y = () => player.getY() - 55
            inter.width = () => 60
            inter.height = () => 30
            inter.isShown = () => player.disconnected && myPlayer.host && !player.replacedByRobot
            inter.container = () => document.getElementById('inGameDiv')

            this.robotButtons.push(inter)
        }
    }

    updateHandInteractables() {
        if (!this.client.state.paintHandInteractables()) {
            return
        }

        if (this.cardInteractables.length != this.client.state.baseState.myPlayer.hand.length) {
            this.makeHandInteractables()
        }

        if (this.client.state.checkIfShouldPlayPreselected()) {
            if (this.client.state.baseState.preselected.length > 0) {
                if (this.client.state.canPlayCard(this.client.state.baseState.preselected[0].getCard())) {
                    this.client.state.playCard(this.client.state.baseState.preselected[0])
                    this.client.state.baseState.shiftPreselected()
                } else {
                    this.client.state.baseState.clearPreselected(0)
                }
            }
        }
    }

    makeHandInteractables() {
        this.cardInteractables.length = 0;
        let myPlayer = this.client.state.baseState.myPlayer
        for (let i = 0; i < myPlayer.hand.length; i++) {
            let card = new CanvasCard(myPlayer.hand[i], 1, this.client.vars.deckImg, this.client.ctx);
            card.index = () => myPlayer.hand.indexOf(card.getCard())
            card.xCenter = () =>
                (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2 + card.index() * this.cardSeparation
                - (myPlayer.hand.length - 1) * this.cardSeparation / 2
            card.yCenter = () =>
                this.client.cachedHeight - this.handYOffset - (this.client.state.cardSelected(card) ? this.selectedCardYOffset : 0)
            card.yPaintOffset = () => (card.isMoused() ? -10 : 0) // + (pass && pass.isSelected(card.getCard()) ? -10 : 0)
            card.isEnabled = () => this.client.state.cardEnabled(card)
            card.isShown = () => this.client.state.paintPlayers()
            card.hidden = () => this.client.state.hideCard(card.getCard())
            card.dark = () => card.isMoused() || this.client.state.baseState.preselected.length > 0 && card.preselection == -1
            card.preselection = -1;
            card.cursor = () => 'pointer'
            card.click = () => this.client.state.cardClicked(card)

            this.cardInteractables.push(card);
        }
    }

    removeHandInteractables() {
        this.cardInteractables.length = 0;
    }

    updateDecision() {
        let baseState = this.client.state.baseState
        if (!baseState.myPlayer) {
            return
        }
        if (baseState.myPlayer.decision !== undefined && baseState.decision === undefined) {
            baseState.message = baseState.myPlayer.decision.prompt
            baseState.decision = baseState.myPlayer.decision
            baseState.decisionResponded = false
            this.setDecision(baseState.myPlayer.decision)
        } else if (baseState.myPlayer.decision === undefined && baseState.decision !== undefined) {
            baseState.message = ''
            baseState.decision = undefined
        }
    }

    setDecision(data) {
        this.decisionButtons.length = 0;

        let sep = 20;
        let widths = [];
        let x = sep;
        for (const text of data.choices) {
            let w = 30 + getStringDimensions(text, font.bold)[0];
            widths.push(w);
            x -= w + sep;
        }
        x /= 2;

        for (let i = 0; i < data.choices.length; i++) {
            let button = document.createElement('button');
            button.innerHTML = data.choices[i];
            button.classList.add(
                'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
                'font-bold', 'text-sm', 'select-none', 'hover:bg-gray-300'
            );
            let icopy = i;
            button.addEventListener('click', () => this.client.state.makeDecision(icopy))

            let wrappedButton = new WrappedDOMElement(button);
            let xcopy = x;
            wrappedButton.x = () => (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2 + xcopy;
            wrappedButton.y = () => this.client.cachedHeight / 2 + 50;
            wrappedButton.width = () => widths[i];
            wrappedButton.height = () => 30;
            wrappedButton.container = () => document.getElementById('inGameDiv');
            wrappedButton.isShown = () => this.client.state.baseState.decision !== undefined && !this.client.state.baseState.decisionResponded
            this.decisionButtons.push(wrappedButton);
            x += widths[i] + sep;
        }
    }

    loadPostGame(data) {
        data.trumps = data.trumps.map(c => new Card(c.num, c.suit))
        for (const player of data.players) {
            player.bidQs = player.bidQs.map(r => r.map(pr => 100 * pr))
            player.hands = player.hands.map(h => h.map(c => new Card(c.num, c.suit)))
            player.plays = player.plays.map(h => h.map(c => new Card(c.num, c.suit)))
            player.makingProbs = player.makingProbs.map(r => r.map(t => t.map(pair => [new Card(pair[0].num, pair[0].suit), pair[1]])))
        }

        this.pgPlayers = data.players
        this.pgTeams = data.teams
        this.pgRounds = data.rounds
        this.pgOptions = data.options

        this.postGamePage.setData(data)
    }

    chat(data) {
        this.chatArea.element.innerHTML += data.sender + ': ' + data.text + '&#10;'
        this.chatArea.element.scrollTop = this.chatArea.element.scrollHeight
    }
}