import { Card } from '../basics.js'

import {
    font, colors, smallCardScale, getStringDimensions, drawText, drawBox, drawOval, createDeckImg, drawCard, drawLine, enableButton, disableButton
} from '../graphics_tools.js'

import {
    CanvasInteractable, WrappedDOMElement, PanelInteractable, CanvasButton, PlayerNamePlate, CanvasCard
} from '../interactable.js'

import { TimerEntry, OhcCanvas } from '../canvas.js'

import { ScoreSheet } from '../scoresheet.js'

import { PostGamePage } from '../postgame.js'

import { ClientStateGameBase } from './base.js'

// states

export class ClientStateOhHell extends ClientStateGameBase {
    constructor(key, client, div) {
        super(key, 'OH_HELL_BASE', client, div, key == 'OH_HELL_BASE' ? OhHellCanvas : undefined)
    }
}

export class ClientStateOhHellPreGame extends ClientStateOhHell {
    constructor(key, client) {
        super(key, client, document.getElementById('preGameDiv'))
    }

    initialize() {
        this.baseState = this.client.stateCache[this.baseKey]
    }

    enter(data) {
        super.enter(data)
        this.baseState.scoreWidth = 0
        document.getElementById("doubleDeckOptionsRow").style.display = 'table-row';
        document.getElementById("teamsOptionsRow").style.display = 'table-row';
        document.getElementById("oregonOptionsRow").style.display = 'none';
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

export class ClientStateOhHellBidding extends ClientStateOhHell {
    constructor(key, client) {
        super(key, client, document.getElementById('inGameDiv'))
    }

    initialize() {
        this.baseState = this.client.stateCache[this.baseKey]
        this.cannotBid = -1
    }

    animateBids() {
        let animateTe = new TimerEntry(this.client.vars.animationTime);
        animateTe.onAction = () => {
            this.baseState.bidTimer = Math.min(animateTe.elapsedTime / this.client.vars.animationTime, 1)
        }
        this.canvas.pushTimerEntry(animateTe, true);

        let stayTe = new TimerEntry(this.client.vars.bidStayTime);
        this.canvas.pushTimerEntry(stayTe, true);

        let bufferTe = new TimerEntry(0);
        this.canvas.pushTimerEntry(bufferTe, true);
    }

    updateServerData_state(type, diff) {
        super.updateServerData_state(type, diff)
        if (diff.state == 'OH_HELL_PLAYING') {
            this.animateBids()
        }
    }

    updateServerDataArgs_cannotBid(type, args) {
        this.cannotBid = args
    }

    makeBid(bid) {
        this.client.emit('bid', { bid: bid })
    }

    enter(data) {
        super.enter(data)
        this.baseState.bidTimer = 0
    }

    adjustDivSizes() { this.canvas.fixScoreWidth() }
    paintHotdog() { return this.baseState.serverData.roundNumber < this.baseState.serverData.rounds.length }
    paintTeamInfo() {
        let data = this.baseState.serverData
        return data.roundNumber < data.rounds.length && !this.baseState.myPlayer.kibitzer && data.options.teams
    }
    paintTrump() { return this.baseState.serverData.trump !== undefined }
    paintPlayers() { return true }
    paintTaken() { return true }
    paintShowSpreadsheet() {
        let data = this.baseState.serverData
        return data.rounds[data.roundNumber] && data.rounds[data.roundNumber].handSize == 1
    }
    paintCornerButtons() { return true }
    paintPreselected() { return true }
    paintNamePlates() { return true }
    highlightPlayer(player) { return player.index == this.baseState.serverData.turn }
    enablePoking(player) { return this.highlightPlayer(player) }
    paintBidAndDealerChips() { return true }
    paintScoreSheet() { return true }
    cardEnabled(card) { return this.baseState.myPlayer.bidded }
    cardClicked(card) {
        if (card.preselection == -1) {
            card.preselection = this.baseState.preselected.length
            this.baseState.preselected.push(card)
        } else {
            this.baseState.clearPreselected(card.preselection)
        }
    }
    paintShowCardButton() { return this.canvas.cardInteractables && this.canvas.cardInteractables.length > 0 && this.canvas.cardInteractables[0].hidden() }
    paintBidInteractables() { return this.isItMyTurn() }
    paintHandInteractables() { return true }
    checkIfShouldPlayPreselected() { return false }
}

export class ClientStateOhHellPlaying extends ClientStateOhHell {
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

    animateTrickStay() {
        let stayTe = new TimerEntry(this.client.vars.trickStayTime);
        stayTe.onLastAction = () => {
            //for (const player of players) {
            //    player.newTrickReset();
            //}
            //leader = index;
        }
        this.canvas.pushTimerEntry(stayTe, true);
    }

    animateTrickTake() {
        let animateTe = new TimerEntry(this.client.vars.animationTime);
        animateTe.onFirstAction = () => {
            for (let player of this.baseState.serverData.players) {
                player.trickTimer = 0
            }
            this.baseState.takenTimer = 0
            this.baseState.lastTrickOwner = this.baseState.serverData.players[this.baseState.serverData.leader]
        }
        animateTe.onAction = () => {
            this.baseState.takenTimer = Math.min(animateTe.elapsedTime / this.client.vars.animationTime, 1);
        }
        this.canvas.pushTimerEntry(animateTe, true);
    }

    updateServerData_players(type, diff) {
        super.updateServerData_players(type, diff)

        if (this.baseState.serverData.players.filter(p => !p.played).length == 0) {
            this.animateTrickStay()
        }

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
        this.animateTrickTake()
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
        this.baseState.takenTimer = 0
        this.baseState.lastTrickOwner = undefined
    }

    adjustDivSizes() { this.canvas.fixScoreWidth() }
    paintHotdog() { return this.baseState.serverData.roundNumber < this.baseState.serverData.rounds.length }
    paintTeamInfo() {
        let data = this.baseState.serverData
        return data.roundNumber < data.rounds.length && !this.baseState.myPlayer.kibitzer && data.options.teams
    }
    paintTrick() { return true }
    paintLastTrick() { return this.baseState.lastTrickOwner && this.baseState.takenTimer == 1 }
    paintTrump() { return this.baseState.serverData.trump !== undefined }
    paintPlayers() { return true }
    paintTaken() { return true }
    paintShowSpreadsheet() {
        let data = this.baseState.serverData
        return data.rounds[data.roundNumber] && data.rounds[data.roundNumber].handSize == 1
    }
    paintCornerButtons() { return true }
    paintPreselected() { return true }
    paintNamePlates() { return true }
    highlightPlayer(player) { return player.index == this.baseState.serverData.turn }
    enablePoking(player) { return this.highlightPlayer(player) }
    paintBidAndDealerChips() { return true }
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
        // TODO passing
        //else if (gameState == GameState.PASSING && !myPlayer.passed) {
        //    if (pass.isSelected(card.getCard())) {
        //        pass.deselect(card.getCard());
        //    } else {
        //        pass.select(card.getCard());
        //    }
        //}
    }
    bidChipColor(player) {
        if (this.baseState.bidTimer < 1) {
            return 'rgba(255, 255, 255, 0.7)'
        }

        let want = player.bid - player.taken
        let h = player.hand.length + (player.trick.num == 0 ? 0 : 1)
        if (this.baseState.serverData.options.teams) {
            let team = this.baseState.serverData.teams[player.team]
            want = this.getTeamBid(team) - this.getTeamTaken(team)
        }

        if (want > 0 && want <= h) {
            return 'rgba(175, 175, 175, 0.7)'
        } else if (want == 0) {
            return 'rgb(125, 255, 125)'
        } else {
            return 'rgb(255, 175, 175)'
        }
    }
    paintHandInteractables() { return true }
}

export class ClientStateOhHellPostGame extends ClientStateOhHell {
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

// canvas

class OhHellCanvas extends OhcCanvas {
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

        this.robotsSpinner = document.getElementById("igRobots")
        this.robotsSpinner.addEventListener('change', () => { this.client.state.sendOptionsUpdate({ robots: this.robotsSpinner.value }) })

        this.doubleDeckCheckBox = document.getElementById("igDoubleDeck")
        this.doubleDeckCheckBox.addEventListener('change', () => { this.client.state.sendOptionsUpdate({ D: this.doubleDeckCheckBox.checked ? 2 : 1 }) })

        this.teamsCheckBox = document.getElementById("igTeams")
        this.teamsCheckBox.addEventListener('change', () => { this.client.state.sendOptionsUpdate({ teams: this.teamsCheckBox.checked }) })

        // TODO
        //igOregon = document.getElementById("igOregon");
        //igOregon.addEventListener('change', () => {
        //    options.oregon = igOregon.checked;
        //    sendOptionsUpdate();
        //});

        this.igStart = document.getElementById("igStart")
        this.igStart.addEventListener('click', () => this.client.state.startGame())

        document.getElementById("igBack").addEventListener('click', () => this.client.state.leaveGame())

        document.getElementById("igBack3").addEventListener('click', () => this.client.state.leaveGame())
        document.getElementById("igDownload").addEventListener('click', () => this.client.state.download())

        igLobby.addEventListener('click', () => {
            this.client.changeState('OH_HELL_PREGAME')
        });

        // filled out statically
        class TeamsPanel extends PanelInteractable {
            constructor() {
                super(
                    document.getElementById('igTeamsContainer'),
                    document.getElementById('igTeamsCanvas'),
                    true
                );

                let parent = this;

                class PlayerButton extends CanvasInteractable {
                    constructor(player) {
                        super();
                        this.player = player;
                        this.y0 = 1;
                    }

                    x() { return parent.x() + 5; }
                    y() { return parent.y() + this.y0 - 9; }
                    width() { return parent.width() - 10; }
                    height() { return 19; }

                    isEnabled() {
                        return thisCanvas.client.state.baseState.myPlayer && thisCanvas.client.state.baseState.myPlayer.host;
                    }

                    paint() {
                        let x = this.x() - parent.x();
                        let y = this.y() - parent.y();

                        if (this.isEnabled()) {
                            if (this.isMoused()) {
                                parent.ctx.fillStyle = '#C0C0C0';
                                drawBox(parent.ctx, x, y, this.width(), this.height(), 10, undefined, true);
                            }
                            if (parent.playerSelected === this.player) {
                                parent.ctx.fillStyle = '#C0C0C0';
                                drawBox(parent.ctx, x, y, this.width(), this.height(), 10, undefined, false);
                            }
                        }

                        drawText(parent.ctx, this.player.name, x + this.width() / 2, y + 10, 1, 1, font.basic, 'black');
                    }

                    click() {
                        if (parent.playerSelected === this.player) {
                            parent.playerSelected = undefined;
                        } else {
                            parent.playerSelected = this.player;
                        }
                    }
                }
                this.PlayerButton = PlayerButton;

                class TeamButton extends CanvasInteractable {
                    constructor(number) {
                        super();
                        this.number = number;
                        this.members = [];
                        this.y0 = 1;
                    }

                    x() { return parent.x() + 1; }
                    y() { return parent.y() + this.y0; }
                    width() { return parent.width() - 2; }
                    height() { return this.members.length * 20 + 25; }

                    isShown() { return this.members.length > 0; }

                    paint() {
                        if (!thisCanvas.client.state.baseState.serverData || !thisCanvas.client.state.baseState.serverData.players || !thisCanvas.client.state.baseState.serverData.teams) {
                            return
                        }
                        let players = thisCanvas.client.state.baseState.serverData.players
                        let teams = thisCanvas.client.state.baseState.serverData.teams

                        this.members = teams[this.number].members

                        this.interactables = this.members.filter(i => i < players.length).map(i => parent.playerButtons[players[i].id]);

                        if (!this.isShown()) {
                            return;
                        }

                        let x = this.x() - parent.x();
                        let y = this.y() - parent.y();

                        parent.ctx.fillStyle = this.isMoused() && this.interactableMoused === this ? '#C0C0C0' : 'white';
                        drawBox(parent.ctx, x, y, this.width(), this.height(), 10, colors[this.number]);

                        drawText(parent.ctx, teams[this.number].name, x + this.width() / 2, y + 10, 1, 1, font.bold, colors[this.number]);
                        for (let i = 0; i < this.interactables.length; i++) {
                            this.interactables[i].y0 = y + 10 + 20 * (i + 1);
                            this.interactables[i].paint();
                        }
                    }

                    click() {
                        let myPlayer = thisCanvas.client.state.baseState.myPlayer
                        if (parent.playerSelected !== undefined) {
                            thisCanvas.client.state.reteam(parent.playerSelected.index, this.number);
                            parent.playerSelected = undefined;
                        } else if (!myPlayer.kibitzer) {
                            thisCanvas.client.state.reteam(myPlayer.index, this.number);
                        }
                    }
                }

                this.playerButtons = {};
                this.playerSelected = undefined;

                this.teamButtons = [];
                for (let i = 0; i < 10; i++) {
                    // TODO update this dynamically
                    this.teamButtons.push(new TeamButton(i));
                }
                this.interactables = this.teamButtons;
            }

            paint() {
                super.paint();

                if (!thisCanvas.client.state.baseState.serverData || !thisCanvas.client.state.baseState.serverData.players) {
                    return
                }

                for (const player of thisCanvas.client.state.baseState.serverData.players) {
                    if (this.playerButtons[player.id] === undefined) {
                        this.playerButtons[player.id] = new this.PlayerButton(player);
                    }
                }

                let y = 1;
                for (const button of this.teamButtons) {
                    button.y0 = y;
                    button.paint();
                    if (button.isShown()) {
                        y += button.height() + 5;
                    }
                }

                this.element.style.height = y + 'px';
                document.getElementById('teamsDiv').style.height =
                    y + 40
                    + document.getElementById('igNewTeam').clientHeight
                    + document.getElementById('igRandomizeTeams').clientHeight
                    + 'px';
            }
        }
        this.teamsPanel = new TeamsPanel();
        document.getElementById("igNewTeam").addEventListener('click', () => {
            let myPlayer = this.client.state.baseState.myPlayer
            if (this.teamsPanel.playerSelected !== undefined) {
                this.client.state.reteam(this.teamsPanel.playerSelected.index);
                this.teamsPanel.playerSelected = undefined;
            } else if (!myPlayer.kibitzer) {
                this.client.state.reteam(myPlayer.index)
            }
        });
        this.igRandomizeTeams = document.getElementById("igRandomizeTeams")
        this.igRandomizeTeams.addEventListener('click', () => this.client.state.scrambleTeams())

        this.scoreSheet = new ScoreSheet('ig', this);
        this.scoreSheet.x = () => this.client.cachedWidth - (this.client.state.baseState.scoreWidth - this.scoreSheet.scoreMargin)
        this.scoreSheet.y = () => this.scoreSheet.scoreMargin
        this.scoreSheet.width = () => this.client.state.baseState.scoreWidth - 2 * this.scoreSheet.scoreMargin
        this.scoreSheet.getPlayers = () => this.scoreSheetPlayers();
        this.scoreSheet.getTeams = () => this.scoreSheetTeams();
        this.scoreSheet.getRounds = () => this.scoreSheetRounds();
        this.scoreSheet.getOptions = () => this.scoreSheetOptions();
        this.scoreSheet.container = () => this.client.state.scoreSheetContainer()
        this.scoreSheet.isShown = () => this.client.state.paintScoreSheet()

        class Hotdog extends PanelInteractable {
            constructor() {
                super(
                    document.getElementById('igHotdogContainer'),
                    document.getElementById('igHotdogCanvas'),
                    false
                );
            }

            x() { return thisCanvas.scoreSheet.x(); }
            y() { return thisCanvas.scoreSheet.y() + thisCanvas.scoreSheet.height() + 5; }
            width() { return thisCanvas.scoreSheet.width(); }
            height() { return 24; }
            container() { return document.getElementById('inGameDiv'); }

            //isShown() { return mode == 'Oh Hell'; }

            paint() {
                super.paint()
                if (!thisCanvas.client.state.paintHotdog()) {
                    return
                }

                this.clear();
                this.fillContainer();

                let serverData = thisCanvas.client.state.baseState.serverData

                let handSize = serverData.rounds[serverData.roundNumber].handSize;
                let totalBid = 0;
                let totalMaxBidTaken = 0;
                if (serverData.options.teams) {
                    let teams = thisCanvas.client.state.baseState.serverData.teams
                    let state = thisCanvas.client.state
                    totalBid = teams.map(t => state.getTeamBid(t)).reduce((a, b) => a + b, 0)
                    totalMaxBidTaken = teams.map(t => Math.max(state.getTeamBid(t), state.getTeamTaken(t))).reduce((a, b) => a + b, 0)
                } else {
                    totalBid = serverData.players.map(p => p.bidded ? p.bid : 0).reduce((a, b) => a + b, 0);
                    totalMaxBidTaken = serverData.players.map(p => p.bidded ? Math.max(p.bid, p.taken ? p.taken : 0) : 0).reduce((a, b) => a + b, 0);
                }

                let leftMessage = totalBid <= handSize ?
                    'Underbid by: ' + (handSize - totalBid) :
                    'Overbid by: ' + (totalBid - handSize);
                let rightMessage = totalMaxBidTaken <= handSize ?
                    'Unwanted tricks: ' + (handSize - totalMaxBidTaken) :
                    'Excess tricks wanted: ' + (totalMaxBidTaken - handSize);

                let leftColor = totalBid <= handSize ? 'rgb(0, 0, 120)' : 'rgb(120, 0, 0)';
                let rightColor = totalMaxBidTaken <= handSize ? 'rgb(0, 0, 120)' : 'rgb(120, 0, 0)';
                if (totalMaxBidTaken == handSize) {
                    rightColor = 'rgb(0, 120, 0)';
                }

                drawText(this.ctx, leftMessage, this.width() / 4, this.height() / 2, 1, 1, font.bold, leftColor);
                drawText(this.ctx, rightMessage, 3 * this.width() / 4, this.height() / 2, 1, 1, font.bold, rightColor);
            }
        }
        this.hotdog = new Hotdog();

        class TeamInfo extends PanelInteractable {
            constructor() {
                super(
                    document.getElementById('igTeamInfoContainer'),
                    document.getElementById('igTeamInfoCanvas'),
                    false
                );
            }

            x() { return thisCanvas.scoreSheet.x(); }
            y() { return thisCanvas.scoreSheet.y() + thisCanvas.scoreSheet.height() + 5 + thisCanvas.hotdog.height() + 5; }
            width() { return thisCanvas.scoreSheet.width(); }
            height() { return 24; }
            container() { return document.getElementById('inGameDiv'); }

            isShown() { return thisCanvas.client.state.baseState.serverData.options && thisCanvas.client.state.baseState.serverData.options.teams }

            paint() {
                super.paint();
                if (!thisCanvas.client.state.paintTeamInfo()) {
                    return;
                }

                this.clear();
                this.fillContainer();

                let myPlayer = thisCanvas.client.state.baseState.myPlayer
                let myTeam = thisCanvas.client.state.baseState.serverData.teams[myPlayer.team]
                let bid = thisCanvas.client.state.getTeamBid(myTeam)
                let taken = thisCanvas.client.state.getTeamTaken(myTeam)

                let leftMessage = 'Team bid: ' + bid;
                let rightMessage = 'Team taken: ' + taken;

                let handSize = myPlayer.hand.length;
                if (myPlayer.trick.num != 0) {
                    handSize++;
                }
                let leftColor = bid - taken > handSize ? 'rgb(120, 0, 0)' : 'rgb(0, 0, 120)';
                let rightColor = bid >= taken ? 'rgb(0, 0, 120)' : 'rgb(120, 0, 0)';
                if (bid == taken) {
                    rightColor = 'rgb(0, 120, 0)';
                }

                drawText(this.ctx, leftMessage, this.width() / 4, this.height() / 2, 1, 1, font.bold, leftColor);
                drawText(this.ctx, rightMessage, 3 * this.width() / 4, this.height() / 2, 1, 1, font.bold, rightColor);
            }
        }
        this.teamInfo = new TeamInfo();

        class LastTrick extends CanvasCard {
            paint() {
                super.paint();
                if (this.isMoused()) {
                    let players = thisCanvas.client.state.baseState.serverData.players
                    for (let k = 0; k < players.length; k++) {
                        let x0 = Math.min(
                            this.xCenter() + 50,
                            thisCanvas.client.cachedWidth - thisCanvas.client.state.baseState.scoreWidth - thisCanvas.lastTrickSeparation * (players.length - 1) - thisCanvas.client.vars.deckImg.width / 2 - 10
                        );
                        let y0 = Math.max(this.yCenter(), thisCanvas.client.vars.deckImg.height / 2 + 10);
                        drawCard(thisCanvas.client.ctx, players[k].lastTrick, x0 + thisCanvas.lastTrickSeparation * k, y0, 1, thisCanvas.client.vars.deckImgSmall, false, -1, undefined);
                    }
                }
            }
        }
        this.lastTrick = new LastTrick(new Card(), smallCardScale, this.client.vars.deckImgSmall, this.client.ctx);
        //this.lastTrick.player = () => this.client.state.baseState.serverData.players[this.client.state.baseState.serverData.leader]
        this.lastTrick.player = () => this.client.state.baseState.lastTrickOwner
        this.lastTrick.xCenter = () => this.lastTrick.player().getTakenX() + this.takenXSeparation * (this.lastTrick.player().taken - 1)
        this.lastTrick.yCenter = () => this.lastTrick.player().getTakenY() + this.takenYSeparation * (this.lastTrick.player().taken - 1)
        this.lastTrick.isShown = () => this.client.state.paintLastTrick()
        this.lastTrick.isEnabled = this.lastTrick.isShown

        let showCardButton = document.createElement('button');
        showCardButton.innerHTML = 'Show card';
        showCardButton.classList.add(
            'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
            'font-bold', 'text-sm', 'select-none', 'hover:bg-gray-300'
        );
        showCardButton.addEventListener('click', () => this.client.state.baseState.showOneCard = true);
        this.showCard = new WrappedDOMElement(showCardButton);
        this.showCard.x = () => (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2 - 40;
        this.showCard.y = () => this.client.cachedHeight - this.handYOffset - this.showCard.height() / 2;
        this.showCard.width = () => 80;
        this.showCard.height = () => 30;
        this.showCard.container = () => document.getElementById('inGameDiv');
        this.showCard.isShown = () => this.client.state.paintShowCardButton()
            

        let showSpreadsheetButton = document.createElement('button');
        showSpreadsheetButton.innerHTML = 'Show spreadsheet';
        showSpreadsheetButton.classList.add(
            'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
            'font-bold', 'text-sm', 'select-none', 'hover:bg-gray-300'
        );
        showSpreadsheetButton.addEventListener('click', () => this.client.state.toggleShowSpreadsheet());
        this.showSpreadsheet = new WrappedDOMElement(showSpreadsheetButton);
        this.showSpreadsheet.x = () => (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2 - 300;
        this.showSpreadsheet.y = () => this.client.cachedHeight - (this.showSpreadsheet.height() + 10);
        this.showSpreadsheet.width = () => 150;
        this.showSpreadsheet.height = () => 32;
        this.showSpreadsheet.container = () => document.getElementById('inGameDiv');
        this.showSpreadsheet.isShown = () => this.client.state.paintShowSpreadsheet()

        class Spreadsheet extends PanelInteractable {
            constructor() {
                super(
                    document.getElementById('igSpreadsheetContainer'),
                    document.getElementById('igSpreadsheetCanvas'),
                    false
                );

                this.margin = 4;
                this.rowHeight = 15;
            }

            x() { return (cachedWidth - scoreWidth) / 2 - 200; }
            y() { return cachedHeight / 2 - this.height() / 2; }
            width() { return 400; }
            height() { return 2 * this.margin + this.rowHeight * (1 + players.length); }
            container() { return document.getElementById('inGameDiv'); }

            isShown() { return thisCanvas.client.state.paintSpreadsheet() }

            paint() {
                super.paint();
                if (!this.isShown()) {
                    return;
                }

                this.clear();
                this.fillContainer();

                drawLine(this.ctx, this.width() * 1 / 3, this.margin, this.width() * 1 / 3, this.height() - this.margin);
                drawLine(this.ctx, this.width() * 2 / 3, this.margin, this.width() * 2 / 3, this.height() - this.margin);
                drawText(this.ctx, 'player', this.width() * 1 / 6, this.rowHeight / 2, 1, 1, font.small, 'black');
                drawText(this.ctx, 'cutoff card', this.width() * 1 / 2, this.rowHeight / 2, 1, 1, font.small, 'black');
                drawText(this.ctx, 'bid', this.width() * 5 / 6, this.rowHeight / 2, 1, 1, font.small, 'black');
                drawLine(this.ctx, this.margin, this.rowHeight, this.width() - this.margin, this.rowHeight);

                let unbidFound = false;
                for (let j = 0; j < players.length; j++) {
                    let i = (rounds[roundNumber].dealer + 1 + j) % players.length;

                    drawText(this.ctx, players[i].name, this.width() * 1 / 6, this.rowHeight * (2 * j + 3) / 2, 1, 1, font.small, 'black');
                    let cutoff = !unbidFound || players[i].bidded ? (spreadsheetRow ? spreadsheetRow[j] : 'todo') : '';
                    drawText(this.ctx, cutoff, this.width() * 1 / 2, this.rowHeight * (2 * j + 3) / 2, 1, 1, font.small, 'black');
                    let bid = players[i].bidded ? players[i].bid : '';
                    drawText(this.ctx, bid, this.width() * 5 / 6, this.rowHeight * (2 * j + 3) / 2, 1, 1, font.small, 'black');

                    if (!players[i].bidded) {
                        unbidFound = true;
                    }
                }
            }
        }
        this.spreadsheet = new Spreadsheet();

        // let acceptButton = document.createElement('button');
        // acceptButton.classList.add(
        //     'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
        //     'font-bold', 'text-sm', 'select-none', 'hover:bg-gray-300'
        // );
        // this.messageAccept = new WrappedDOMElement(acceptButton);
        // this.messageAccept.x = () => (cachedWidth - scoreWidth) / 2 - 100;
        // this.messageAccept.y = () => cachedHeight / 2 + 50;
        // this.messageAccept.width = () => 80;
        // this.messageAccept.height = () => 30;
        // this.messageAccept.container = () => document.getElementById('inGameDiv');
        // this.messageAccept.isShown = () => showMessageButtons;
        //
        // let declineButton = document.createElement('button');
        // declineButton.classList.add(
        //     'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
        //     'font-bold', 'text-sm', 'select-none', 'hover:bg-gray-300'
        // );
        // this.messageDecline = new WrappedDOMElement(declineButton);
        // this.messageDecline.x = () => (cachedWidth - scoreWidth) / 2 + 20;
        // this.messageDecline.y = () => cachedHeight / 2 + 50;
        // this.messageDecline.width = () => 80;
        // this.messageDecline.height = () => 30;
        // this.messageDecline.container = () => document.getElementById('inGameDiv');
        // this.messageDecline.isShown = () => showMessageButtons;

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
            if (this.client.state.baseState.serverData
                && this.client.state.baseState.serverData.options
                && this.client.state.baseState.serverData.options.teams) {
                divAbove += this.teamInfo.y() + this.teamInfo.height()
            } else {
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
            this.showCard,
            this.showSpreadsheet,
            this.spreadsheet,
            // this.messageAccept,
            // this.messageDecline,
            this.leaveButton,
            this.endButton,
            this.claimButton,
            this.chatField,
            this.chatArea,
            this.divider
        ];

        // TODO
        //let passB = document.createElement('button');
        //passB.innerHTML = 'Pass';
        //passB.classList.add(
        //    'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
        //    'font-bold', 'text-md', 'select-none', 'hover:bg-gray-300'
        //);
        //passB.addEventListener('click', () => makePass(pass.list));
        //this.passButton = new WrappedDOMElement(passB);
        //this.passButton.x = () => (this.client.cachedWidth - scoreWidth) / 2 - (options.oregon ? 100 : 45);
        //this.passButton.y = () => this.client.cachedHeight - 310;
        //this.passButton.width = () => 90;
        //this.passButton.height = () => 30;
        //this.passButton.container = () => document.getElementById('inGameDiv');
        //this.passButton.isShown = () => gameState == GameState.PASSING && !myPlayer.passed && !myPlayer.isKibitzer();
        //this.passButton.isEnabled = () => pass.list.length == pass.toPass;
        //this.passButton.click = () => { }; // so cards don't deselect

        //let abstainB = document.createElement('button');
        //abstainB.innerHTML = 'Abstain';
        //abstainB.classList.add(
        //    'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
        //    'font-bold', 'text-md', 'select-none', 'hover:bg-gray-300'
        //);
        //abstainB.addEventListener('click', () => makePass([]));
        //this.abstainButton = new WrappedDOMElement(abstainB);
        //this.abstainButton.x = () => (this.client.cachedWidth - scoreWidth) / 2 + 10;
        //this.abstainButton.y = () => this.client.cachedHeight - 310;
        //this.abstainButton.width = () => 90;
        //this.abstainButton.height = () => 30;
        //this.abstainButton.container = () => document.getElementById('inGameDiv');
        //this.abstainButton.isShown = () => gameState == GameState.PASSING && !myPlayer.passed && !myPlayer.isKibitzer() && options.oregon;
        //this.abstainButton.isEnabled = () => options.oregon;
        //this.abstainButton.click = () => { }; // so cards don't deselect

        this.postGamePage = new PostGamePage(this);

        // filled out dynamically
        this.namePlates = [];
        this.robotButtons = [];
        this.cardInteractables = [];
        this.bidButtons = [];

        this.interactables = [
            [this.teamsPanel],
            [this.scoreSheet, this.hotdog, this.teamInfo],
            this.bidButtons,
            //[this.passButton, this.abstainButton], //TODO
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

    cleanup() {
        this.namePlates.length = 0;
        this.cardInteractables.length = 0;
        this.bidButtons.length = 0;
        this.timerQueue.clear();
    }

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
        this.updateBidInteractables()
        this.updateHandInteractables()
        this.updateDecision()
        this.adjustDivSizes();
        this.paintTrump();
        this.paintPlayers();
        this.paintTaken();
    }

    customPaintLast() {
        this.paintTrick();
        this.paintPreselected();
        this.paintMessage();

        this.paintFrameRate();
    }
    
    updateHostOptions() {
        if (!this.client.state.baseState.myPlayer) {
            return
        }
        if (!this.client.state.baseState.myPlayer.host) {
            this.robotsSpinner.disabled = true
            this.doubleDeckCheckBox.disabled = true
            this.teamsCheckBox.disabled = true
            //igOregon.disabled = true // TODO
            disableButton(this.igStart)
            disableButton(this.igRandomizeTeams)
        } else {
            this.robotsSpinner.disabled = false
            this.doubleDeckCheckBox.disabled = false
            this.teamsCheckBox.disabled = false
            //igOregon.disabled = false // TODO
            enableButton(this.igStart)
            enableButton(this.igRandomizeTeams)
        }
    }

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

    paintTrump() {
        if (!this.client.state.paintTrump()) {
            return;
        }

        let x = 50;
        let y = 66;

        drawCard(this.client.ctx, new Card(), x - 4, y - 4, 1, this.client.vars.deckImgSmall, false, -1, undefined);
        drawCard(this.client.ctx, new Card(), x - 2, y - 2, 1, this.client.vars.deckImgSmall, false, -1, undefined);
        drawCard(this.client.ctx, this.client.state.baseState.serverData.trump, x, y, 1, this.client.vars.deckImgSmall, false, -1, undefined);
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

            // TODO
            //if (gameState == GameState.PASSING) {
            //    if (player.passed) {
            //        let startX = player.getPassX();
            //        let startY = player.getPassY();

            //        let passedTo = player.index;
            //        if (player.passedTo != -1) {
            //            passedTo = player.passedTo;
            //        }

            //        let endX = players[passedTo].getPassX();
            //        let endY = players[passedTo].getPassY();

            //        let x = player.getBidTimer() * endX + (1 - player.getBidTimer()) * startX;
            //        let y = player.getBidTimer() * endY + (1 - player.getBidTimer()) * startY;

            //        for (let i = 0; i < player.pass.length; i++) {
            //            drawCard(ctx,
            //                player.pass[i],
            //                x + (i - (player.pass.length - 1) / 2) * separation,
            //                y,
            //                smallCardScale, this.client.vars.deckImgSmall, false, -1, undefined
            //            );
            //        }
            //    }
            //}
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

        for (const player of this.client.state.baseState.serverData.players) {
            for (let j = 0; j < player.taken; j++) {
                let takenX = player.getTakenX();
                let takenY = player.getTakenY();

                let isLastTrick = player.index == this.client.state.baseState.serverData.leader && j == player.taken - 1;

                let x = takenX + this.takenXSeparation * j;
                let y = takenY + this.takenYSeparation * j;
                let t = this.client.state.baseState.takenTimer
                if (isLastTrick && t < 1) {
                    x = t * x + (1 - t) * (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2;
                    y = t * y + (1 - t) * this.client.cachedHeight / 2;
                }

                if (!isLastTrick || !this.lastTrick.isShown()) {
                    drawCard(this.client.ctx, new Card(), x, y, smallCardScale, this.client.vars.deckImgSmall, false, -1, undefined);
                }
            }
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
                player.getX = () => 10
                player.getY = () => this.client.cachedHeight * (cut1 - index) / (cut1 + 1)
                player.getJust = () => 0
                player.getTakenX = () => player.getX() + 20
                player.getTakenY = () => player.getY() + 50
                player.getPassX = () => player.getX() + 250
                player.getPassY = () => player.getY()
                player.pov = () => false;
            } else if (index < cut2) {
                player.getX = () => (this.client.cachedWidth - this.client.state.baseState.scoreWidth) * (index - cut1 + 1) / (cut2 - cut1 + 1)
                player.getY = () => 85
                player.getJust = () => 1
                player.getTakenX = () => player.getX() + 110
                player.getTakenY = () => player.getY() - 35
                player.getPassX = () => player.getX()
                player.getPassY = () => player.getY() + 100
                player.pov = () => false
            } else if (index < N - 1) {
                player.getX = () => this.client.cachedWidth - this.client.state.baseState.scoreWidth - 10
                player.getY = () => this.client.cachedHeight * (index - cut2 + 1) / (N - 1 - cut2 + 1)
                player.getJust = () => 2
                player.getTakenX = () => player.getX() - 90
                player.getTakenY = () => player.getY() + 50
                player.getPassX = () => player.getX() - 250
                player.getPassY = () => player.getY()
                player.pov = () => false
            } else {
                player.getX = () => (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2
                player.getY = () => this.client.cachedHeight - 20
                player.getJust = () => 1
                player.getTakenX = () => {
                    let data = this.client.state.baseState.serverData
                    if (data.rounds[data.roundNumber] === undefined) {
                        return 0
                    } else {
                        return player.getX() + Math.max(
                            260,
                            (data.rounds[data.roundNumber].handSize - 1) * this.cardSeparation / 2 + this.client.vars.deckImg.width / 2 + 20
                        )
                    }
                }
                player.getTakenY = () => player.getY() - 50
                player.getPassX = () => player.getX()
                player.getPassY = () => player.getY() - 300
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
            card.hidden = () => !this.client.state.baseState.showOneCard
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

    updateBidInteractables() {
        let paintBidInteractables = this.client.state.paintBidInteractables()
        if (this.bidButtons.length == 0 && paintBidInteractables) {
            this.makeBidInteractables()
        } else if (this.bidButtons.length > 0 && !paintBidInteractables) {
            this.removeBidInteractables()
        }
    }

    makeBidInteractables() {
        this.bidButtons.length = 0;
        let myPlayer = this.client.state.baseState.myPlayer
        for (let i = 0; i <= myPlayer.hand.length; i++) {
            let button = document.createElement('button');
            button.innerHTML = i
            button.classList.add(
                'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
                'font-bold', 'text-sm', 'select-none', 'hover:bg-gray-300'
            );
            button.addEventListener('click', () => {
                this.client.state.makeBid(i)
                this.removeBidInteractables()
            })

            let wrappedButton = new WrappedDOMElement(button);
            wrappedButton.x = () => (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2 + i * 40 - myPlayer.hand.length * 40 / 2 - 15
            wrappedButton.y = () => this.client.cachedHeight - 210 - 15
            wrappedButton.width = () => 30
            wrappedButton.height = () => 30
            wrappedButton.container = () => document.getElementById('inGameDiv')
            wrappedButton.isEnabled = () => i != this.client.state.cannotBid
            this.bidButtons.push(wrappedButton);
        }
    }

    removeBidInteractables() {
        for (let button of this.bidButtons) {
            button.dispose()
        }
        this.bidButtons.length = 0
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
