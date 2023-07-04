import { Card } from '../basics.js'

import {
    font, colors, smallCardScale, getStringDimensions, drawText, drawBox, drawOval, createDeckImg, drawCard, drawLine, enableButton, disableButton
} from '../graphics_tools.js'

import {
    CanvasInteractable, WrappedDOMElement, PanelInteractable, CanvasButton, PlayerNamePlate, CanvasCard
} from '../interactable.js'

import { TimerEntry, OhcCanvas } from '../canvas.js'

import { ScoreSheet } from '../scoresheet.js'

import { PostGamePage, PostGameSummaryTab, PostGameBidsTab, PostGamePlaysTab } from '../postgame.js'

import { ClientStateGameBase, createClientStatePreGame, createClientStatePlaying, createClientStatePostGame, CanvasBase } from './base.js'

// states

export class ClientStateOhHell extends ClientStateGameBase {
    constructor(key, client, div) {
        super(key, 'OH_HELL_BASE', client, div, key == 'OH_HELL_BASE' ? OhHellCanvas : undefined)
    }

    initialize() {
        super.initialize()
        this.showSpreadsheet = false
        this.showOneCard = false
        this.decision = undefined
        this.decisionResponded = false

        this.bidTimer = 1
    }

    toggleShowSpreadsheet() {
        this.baseState.showSpreadsheet = !this.baseState.showSpreadsheet
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
        super.updateServerData_players(type, diff)

        let myIndex = this.baseState.myPlayer.index
        if (type == 'update' && diff.players[myIndex] && diff.players[myIndex].hand && diff.players[myIndex].hand.length > 0) {
            let round = this.baseState.serverData.rounds[this.baseState.serverData.roundNumber]
            this.baseState.showOneCard = round.handSize > 1 || myIndex != round.dealer || this.baseState.myPlayer.kibitzer
        }
    }

    paintTrump() { return false }
    paintShowSpreadsheet() { return false }
    paintSpreadsheet() { this.paintShowSpreadsheet() && this.baseState.showSpreadsheet }
    bidChipColor(player) { return 'rgba(255, 255, 255, 0.7)' }
    paintBidInteractables() { return false }
    hideCard(card) { return !this.baseState.showOneCard }

    getTeamBid(team) { return team.members.reduce((a, i) => a + this.baseState.serverData.players[i].bid, 0) }
    getTeamTaken(team) { return team.members.reduce((a, i) => a + this.baseState.serverData.players[i].taken, 0) }
    getTeamScore(team) {
        if (team.members.length == 0) {
            return undefined
        }
        return this.baseState.serverData.players[team.members[0]].score
    }

    showroundmessage() {
        if (this.baseState.myPlayer.kibitzer) {
            return
        }

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
}

export class ClientStateOhHellPreGame extends createClientStatePreGame(ClientStateOhHell) {
    constructor(key, client) {
        super(key, client)
    }

    enter(data) {
        super.enter(data)
        document.getElementById("oregonOptionsRow").style.display = 'none';
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

        this.pushBasicTimer(() => { }, this.client.vars.bidStayTime, true)
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

export class ClientStateOhHellPlaying extends createClientStatePlaying(ClientStateOhHell) {
    constructor(key, client) {
        super(key, client)
    }

    paintHotdog() { return this.baseState.serverData.roundNumber < this.baseState.serverData.rounds.length }
    paintTeamInfo() {
        let data = this.baseState.serverData
        return data.roundNumber < data.rounds.length && !this.baseState.myPlayer.kibitzer && data.options.teams
    }
    paintTrump() { return this.baseState.serverData.trump !== undefined }
    paintShowSpreadsheet() {
        let data = this.baseState.serverData
        return data.rounds[data.roundNumber] && data.rounds[data.roundNumber].handSize == 1
    }
    paintBidAndDealerChips() { return true }
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
}

export class ClientStateOhHellPostGame extends createClientStatePostGame(ClientStateOhHell) {
    constructor(key, client) {
        super(key, client)
    }
}

// canvas

class OhHellCanvas extends CanvasBase {
    constructor(client) {
        super(client)
    }

    initialize() {
        if (this.initialized) {
            return
        }
        super.initialize()
        console.log(this.interactables)

        // listeners
        this.robotsSpinner = document.getElementById("igRobots")
        this.robotsSpinner.addEventListener('change', () => { this.client.state.sendOptionsUpdate({ robots: this.robotsSpinner.value }) })

        this.doubleDeckCheckBox = document.getElementById("igDoubleDeck")
        this.doubleDeckCheckBox.addEventListener('change', () => { this.client.state.sendOptionsUpdate({ D: this.doubleDeckCheckBox.checked ? 2 : 1 }) })

        this.teamsCheckBox = document.getElementById("igTeams")
        this.teamsCheckBox.addEventListener('change', () => { this.client.state.sendOptionsUpdate({ teams: this.teamsCheckBox.checked }) })

        igLobby.addEventListener('click', () => this.client.changeState('OH_HELL_PREGAME'))

        let thisCanvas = this

        // filled out statically
        class OhHellScoreSheet extends ScoreSheet {
            constructor(prefix, canvas) { super(prefix, canvas) }

            paintRoundLabels(ctx) {
                // dealers and hand sizes
                for (let i = 0; i < this.rounds.length; i++) {
                    let round = this.rounds[i];
                    drawText(ctx,
                        round.handSize,
                        this.margin + this.dealerHWidth / 2,
                        this.scoreVSpacing * (i + 0.5),
                        1, 1,
                        font.basic, 'black'
                    );
                    drawText(ctx,
                        this.playersUnsorted[round.dealer].name.substring(0, 1),
                        2 * this.margin + 1.5 * this.dealerHWidth,
                        this.scoreVSpacing * (i + 0.5),
                        1, 1,
                        font.basic, 'black'
                    );
                }
            }

            paintScroll(ctx) {
                let wid = (this.width() - 4 * this.margin - 2 * this.dealerHWidth) / this.players.length;
                let height = this.scrollCanvasHeight();

                let currentX = 3 * this.margin + 2 * this.dealerHWidth;

                let colCount = this.options.teams ? this.teams.length : this.players.length;
                for (let i = 0; i < colCount; i++) {
                    let members = this.options.teams ? this.teams[i].members.map(j => this.players[j]) : [this.players[i]];
                    let scoresList = members[0].scores;
                    if (!scoresList) {
                        scoresList = []
                    }
                    let fullWid = wid * members.length;

                    if (i > 0) {
                        drawLine(ctx, currentX, 0, currentX, height);
                    }

                    for (let j = 0; j < this.rounds.length; j++) {
                        let score = j < scoresList.length ? scoresList[j] : '';

                        let k = members.length;
                        let fnt = font.basic;
                        let b = 0;

                        // bid chips
                        b = (fnt == font.basic ? 13 : 9) + 3;
                        let chipStart = j < scoresList.length ? 0 : this.margin + b - wid;
                        let chipSpacing = j < scoresList.length ? this.margin + b : wid;
                        for (const p of members) {
                            if (p.bids && j < p.bids.length) {
                                ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';

                                // if (p.takens === undefined || p.takens.length < p.bid.length) {
                                //     ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';
                                // } else if (p.takens[j] == p.bids[j]) {
                                //     ctx.fillStyle = 'rgb(255, 175, 175)';
                                // } else {
                                //     ctx.fillStyle = 'rgb(125, 255, 125)';
                                // }

                                drawOval(ctx,
                                    currentX + 1 + fullWid - chipSpacing * k - chipStart,
                                    this.scoreVSpacing * (j + 0.5) - b / 2,
                                    b, b
                                );
                                drawText(ctx,
                                    p.bids[j],
                                    currentX + 1 + fullWid - chipSpacing * k - chipStart + b / 2,
                                    this.scoreVSpacing * (j + 0.5),
                                    1, 1,
                                    fnt, 'black'
                                );
                            }
                            k--;
                        }

                        // scores
                        k = members.length;
                        drawText(ctx,
                            score,
                            currentX + 1 + fullWid / 2 - this.margin * k / 2 - b * k / 2,
                            this.scoreVSpacing * (j + 0.5),
                            1, 1,
                            fnt, 'black'
                        );
                    }

                    currentX += fullWid;
                }
            }
        }
        this.scoreSheet = new OhHellScoreSheet('ig', this);
        this.scoreSheet.x = () => this.client.cachedWidth - (this.client.state.baseState.scoreWidth - this.scoreSheet.scoreMargin)
        this.scoreSheet.y = () => this.scoreSheet.scoreMargin
        this.scoreSheet.width = () => this.client.state.baseState.scoreWidth - 2 * this.scoreSheet.scoreMargin
        this.scoreSheet.getPlayers = () => this.scoreSheetPlayers();
        this.scoreSheet.getTeams = () => this.scoreSheetTeams();
        this.scoreSheet.getRounds = () => this.scoreSheetRounds();
        this.scoreSheet.getOptions = () => this.scoreSheetOptions();
        this.scoreSheet.container = () => this.client.state.scoreSheetContainer()
        this.scoreSheet.isShown = () => this.client.state.paintScoreSheet()

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

        // filled out dynamically
        this.bidButtons = [];

        this.interactables = this.interactables.concat([
            [this.scoreSheet],
            [this.showCard, this.showSpreadsheet, this.spreadsheet],
            [this.teamsPanel],
            [this.hotdog, this.teamInfo],
            this.bidButtons
        ])
    }

    customPaintFirst() {
        super.customPaintFirst()
        this.updateBidInteractables()
        this.paintTrump();
    }

    updateHostOptions() {
        if (!this.client.state.baseState.myPlayer) {
            return
        }
        if (!this.client.state.baseState.myPlayer.host) {
            this.robotsSpinner.disabled = true
            this.doubleDeckCheckBox.disabled = true
            this.teamsCheckBox.disabled = true
            disableButton(this.igStart)
            disableButton(this.igRandomizeTeams)
        } else {
            this.robotsSpinner.disabled = false
            this.doubleDeckCheckBox.disabled = false
            this.teamsCheckBox.disabled = false
            enableButton(this.igStart)
            enableButton(this.igRandomizeTeams)
        }
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

    createPostGamePage() {
        return new OhHellPostGamePage(this)
    }
}

class OhHellPostGamePage extends PostGamePage {
    constructor(canvas) {
        super(canvas)

        this.addTab(PostGameSummaryTab, document.getElementById("igSummary"))
        this.addTab(PostGameBidsTab, document.getElementById("igBids"))
        this.addTab(PostGamePlaysTab, document.getElementById("igPlays"))
    }
}