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
        this.showSpreadsheet = false
        this.message = ''
        this.showOneCard = false
        this.preselected = []
        this.decision = undefined
        this.decisionResponded = false

        this.bidTimer = 1
        this.takenTimer = 1
        this.lastTrickOwner = undefined

        this.cardJustPlayed = undefined

        this.pokeTime = 25000
    }

    enter(data) {
        this.canvas.initialize()
        super.enter(data)
    }

    toggleShowSpreadsheet() {
        this.baseState.showSpreadsheet = !this.baseState.showSpreadsheet
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

        //TODO
        //if (gameState == GameState.PASSING && !myPlayer.passed) {
        //    pass.clear()
        //} else {
        //    this.clearPreselected(0)
        //}
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

    updateServerData_options(type, diff) {
        let options = this.baseState.serverData.options
        if (options.robots !== undefined) {
            this.canvas.robotsSpinner.value = options.robots
        }
        if (options.D !== undefined) {
            this.canvas.doubleDeckCheckBox.checked = options.D == 2
        }
        if (options.teams !== undefined) {
            this.canvas.teamsCheckBox.checked = options.teams
            document.getElementById('teamsDiv').style.display = options.teams ? 'inline' : 'none'
        }
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
            let round = this.baseState.serverData.rounds[this.baseState.serverData.roundNumber]
            this.baseState.showOneCard = round.handSize > 1 || myIndex != round.dealer || this.baseState.myPlayer.kibitzer
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
    paintTrump() { return false }
    paintTrick() { return false }
    paintLastTrick() { return false }
    paintPlayers() { return false }
    paintTaken() { return false }
    paintShowSpreadsheet() { return false }
    paintSpreadsheet() { this.paintShowSpreadsheet() && this.baseState.showSpreadsheet }
    paintCornerButtons() { return false }
    paintPostGame() { return false }
    paintPreselected() { return false }
    paintMessage() { return this.baseState.message != '' }
    chatWidth() { return this.baseState.scoreWidth - 20 }
    nameplatesAboveChat() { return false }
    paintNamePlates() { return false }
    enablePoking(player) { return false }
    highlightPlayer(player) { return false }
    paintBidAndDealerChips() { return false }
    scoreSheetContainer() { return document.getElementById('inGameDiv') }
    paintScoreSheet() { return false }
    scoreSheetPlayers() { return this.baseState.serverData.players }
    scoreSheetTeams() { return this.baseState.serverData.teams }
    scoreSheetRounds() { return this.baseState.serverData.rounds }
    scoreSheetOptions() { return this.baseState.serverData.options }
    cardSelected(card) { return card.preselection != -1 } // TODO do this for hearts: || pass && pass.isSelected(card.getCard())
    cardEnabled(card) { return false }
    cardClicked(card) { }
    bidChipColor(player) { return 'rgba(255, 255, 255, 0.7)' }
    paintShowCardButton() { return false }
    paintBidInteractables() { return false }
    paintHandInteractables() { return false }

    isItMyTurn() { return this.baseState.myPlayer.index == this.baseState.serverData.turn && !this.baseState.myPlayer.kibitzer }

    getTeamBid(team) { return team.members.reduce((a, i) => a + this.baseState.serverData.players[i].bid, 0) }
    getTeamTaken(team) { return team.members.reduce((a, i) => a + this.baseState.serverData.players[i].taken, 0) }
    getTeamScore(team) {
        if (team.members.length == 0) {
            return undefined
        }
        return this.baseState.serverData.players[team.members[0]].score
    }

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

    showroundmessage() {
        let te = new TimerEntry(this.client.vars.messageTime)
        te.onFirstAction = () => {
            let myPlayer = this.baseState.myPlayer
            if (myPlayer.kibitzer) {
                return
            }

            let teams = this.baseState.serverData.options.teams
            let pronoun = teams ? 'Your team' : 'You';

            let bid = teams ? this.getTeamBid(myPlayer.team) : myPlayer.bid
            let taken = teams ? this.getTeamTaken(myPlayer.team) : myPlayer.taken

            let text = ''
            if (bid == taken) {
                text = pronoun + ' made it!'
            } else {
                text = pronoun + ' went down by ' + Math.abs(bid - taken) + '.'
            }
            this.baseState.message = text
        }
        te.onLastAction = () => {
            this.baseState.message = ''
        }
        this.canvas.pushTimerEntry(te)
    }

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
