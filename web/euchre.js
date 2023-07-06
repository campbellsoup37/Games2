const log = require('./logging').log
cards = require('./card')
core = require('./core')

var CoreState = {
    PREGAME: 'EUCHRE_PREGAME',
    TRUMP: 'EUCHRE_TRUMP',
    DISCARD: 'EUCHRE_DISCARD',
    PLAYING: 'EUCHRE_PLAYING',
    POSTGAME: 'EUCHRE_POSTGAME'
}

class EuchrePlayer extends core.Player {
    constructor(core) {
        super()
        this.core = core
        this.team = 0;
    }

    toDict(visible) {
        return {
            name: this.name,
            id: this.id,
            human: this.human,
            host: this.host,
            disconnected: this.disconnected,
            replacedByRobot: this.replacedByRobot,
            kibitzer: this.kibitzer,
            index: this.index,
            team: this.team,
            taken: this.taken,
            score: this.score,
            hand: this.hand ? this.hand.map(c => visible ? c : new cards.Card()) : [],
            trick: this.trick,
            played: this.played,
            lastTrick: this.lastTrick,
            decision: visible ? this.decision : undefined,
            scores: this.scores,
            trumpChoice: this.trumpChoice,
            bidded: this.bidded
        };
    }

    toPostGameDict() {
        return {
            id: this.id,
            name: this.name,
            index: this.index,
            human: this.human,
            hands: this.hands.map(h => h.map(c => c.toDict())),
            takens: this.takens,
            scores: this.scores,
            score: this.score,
            plays: this.plays.map(r => r.map(c => c.toDict())),
            trumpChoices: this.trumpChoices
        };
    }

    newGameReset() {
        this.score = 0;
        this.trick = new cards.Card();
        this.lastTrick = new cards.Card();
        this.takens = [];
        this.scores = [];
        this.hands = [];
        this.plays = [];
        this.trumpChoices = []
    }

    newRoundReset() {
        this.taken = 0;
        this.trick = new cards.Card();
        this.played = false;
        this.lastTrick = new cards.Card();
        this.acceptedClaim = false;
        this.plays.push([]);
        this.trumpChoices.push([])
        this.trumpChoice = undefined
        this.bidded = false
    }

    async chooseTrumpAsync() {
        let choice = await this.strategyModule.chooseTrump()
        this.trumpChoiceReady(choice)
    }

    async orderUpAsync() {
        let choice = await this.strategyModule.orderUp()
        this.discardReady(new cards.Card(choice.discard))
    }

    async playAsync() {
        let choice = await this.strategyModule.makePlay()
        this.playReady(new cards.Card(choice.card))
    }

    addTrumpChoice(choice) {
        this.trumpChoice = choice
        this.bidded = true
        this.trumpChoices[this.trumpChoices.length - 1].push(choice)
    }
}

class EuchreHumanPlayer extends core.createHumanPlayer(EuchrePlayer) {
    constructor(user, core) { super(user, core, core) }

    trumpChoiceReady(choice) {
        if (this.replacedByRobot) {
            this.core.incomingTrumpChoice(this.index, choice)
            this.readiedTrumpChoice = undefined
        } else {
            this.readiedTrumpChoice = choice
        }
    }

    discardReady(choice) {
        if (this.replacedByRobot) {
            this.core.incomingDiscard(this.index, choice)
            this.readiedDiscard = undefined
        } else {
            this.readiedDiscard = choice
        }
    }

    replaceWithRobot() {
        super.replaceWithRobot()
        if (this.readiedTrumpChoice !== undefined) {
            this.core.incomingTrumpChoice(this.index, this.readiedTrumpChoice)
            this.readiedTrumpChoice = undefined
        } else if (this.readiedDiscard !== undefined) {
            this.core.incomingDiscard(this.index, this.readiedDiscard)
            this.readiedDiscard = undefined
        }
    }
}

class EuchreAiPlayer extends core.createAiPlayer(EuchrePlayer) {
    constructor(number, core) { super(number, core, core) }

    trumpChoiceReady(choice) {
        this.core.incomingTrumpChoice(this.index, choice)
    }

    discardReady(choice) {
        this.core.incomingDiscard(this.index, choice)
    }
}

class EuchreCore extends core.Core {
    constructor(players, game, options) {
        super(players, game, options)
        this.state = CoreState.PREGAME
        this.coreCpp = undefined
    }

    toDict(index) {
        return {
            options: this.options,
            rounds: this.rounds,
            roundNumber: this.roundNumber,
            leader: this.leader,
            state: this.state,
            turn: this.turn,
            upCard: this.upCard,
            players: this.players.playersDict(index),
            kibitzers: this.players.kibitzersDict(index),
            teams: this.players.teams.map(t => t.toDict()),
            phase: this.phase,
            declarer: this.declarer
        };
    }

    createHumanPlayer(user) {
        return new EuchreHumanPlayer(user, this)
    }

    createAiPlayer(number) {
        return new EuchreAiPlayer(number, this)
    }

    isInGame() {
        return this.state != CoreState.PREGAME && this.state != CoreState.POSTGAME
    }

    verifyGameCanStart() {
        let N = this.players.players.filter(p => p.human).length + this.options.robots;
        return N == 4;
    }

    sendGameState(player) {
        let choices = {}
        if (player.index == this.turn) {
            if (this.state == CoreState.PLAYING) {
                choices.canPlay = this.whatCanIPlay()
            }
        }
        this.addUpdateDiff(this.toDict(player.kibitzer ? -1 : player.index), choices)
        this.flushDiffs([player])
    }

    buildRounds() {
        this.rounds = []
        this.addARound()
    }

    addARound() {
        this.rounds.push({ dealer: 0, handSize: 5 })
    }

    transitionFromStart() {
        this.coreCpp.gameSetup()
        this.deal()
    }

    deal() {
        let data = this.coreCpp.deal()

        let hands = {
            hands: data.hands.map(h => h.map(c => new cards.Card(c))),
            trump: [new cards.Card(data.upCard)]
        }

        this.upCard = new cards.Card(data.upCard)
        this.trumps.push(this.upCard)

        this.leader = data.leader;
        this.turn = data.leader;

        this.addUpdateDiff({ upCard: this.upCard, leader: this.leader })

        this.leaders.push([]);
        this.winners.push([]);

        this.players.newRound();
        this.addUpdateDiff({
            players: this.players.players.map(p => ({
                taken: 0,
                trick: new cards.Card(),
                bidded: false,
                played: false,
                lastTrick: new cards.Card()
            }))
        })
        this.flushDiffs()

        this.players.giveHands(hands);

        this.transitionFromDeal();
    }

    transitionFromDeal() {
        this.state = CoreState.TRUMP
        this.phase = 0
        this.players.players[this.turn].chooseTrumpAsync()
        this.addUpdateDiff({ state: this.state, phase: this.phase, turn: this.turn })
        this.flushDiffs()
    }

    incomingTrumpChoice(index, choice) {
        let player = this.players.get(index);

        if (this.state != CoreState.TRUMP) {
            let action = choice.pass ? 'pass' : 'choose trump'
            log(`ERROR: Player "${player.id}" attempted to ${action}, but the game is not in trump state.`);
            return;
        } else if (index != this.turn) {
            log(`ERROR: Player "${player.id}" attempted to ${action} out of turn.`);
            return;
        }

        player.addTrumpChoice(choice)

        this.addUpdateDiff({}, { move: { human: player.human } })
        this.flushDiffs()
        this.addUpdateDiff({
            players: {
                [player.index]: {
                    trumpChoice: choice,
                    bidded: true
                }
            }
        })
        this.flushDiffs()

        let response = this.coreCpp.applyTrumpChoice(choice)
        this.turn = response.turn

        let choices = {}
        if (response.trump == -1) {
            if (this.phase != response.phase) {
                for (let player of this.players.players) {
                    player.bidded = false
                }
                this.phase = response.phase
                this.addUpdateDiff({ phase: this.phase })
                this.flushDiffs()
                this.addUpdateDiff({ players: this.players.players.map(p => ({ bidded: false })) })
                this.flushDiffs()
            }

            this.players.players[this.turn].chooseTrumpAsync()
        } else {
            this.trump = response.trump
            this.alone = response.alone
            this.declarer = response.declarer

            this.addUpdateDiff({ trump: this.trump, alone: this.alone, declarer: this.declarer })
            this.flushDiffs()

            for (let player of this.players.players) {
                player.hand.sort((c1, c2) => c1.compSortEuchre(c2, this.trump))
                this.addUpdateDiff({ players: { [player.index]: { hand: [] } } })
                this.addUpdateDiff({ players: { [player.index]: { hand: player.hand } } }, { resort: true })
                this.flushDiffs([player].concat(this.players.kibitzers))
            }

            if (response.orderedUp) {
                this.orderUp()
            } else {
                this.transitionToPlay()
            }
        }

        this.flushDiffs()
        this.addUpdateDiff({ state: this.state, turn: this.turn })
        this.flushDiffs(this.players.players.filter(p => p.index != this.turn).concat(this.players.kibitzers))
        this.addUpdateDiff({ state: this.state, turn: this.turn }, choices)
        this.flushDiffs([this.players.players[this.turn]])
    }

    orderUp() {
        this.state = CoreState.DISCARD

        let dealer = this.rounds[this.roundNumber].dealer
        let player = this.players.players[dealer]
        player.hand.push(this.upCard)
        player.hand.sort((c1, c2) => c1.compSortEuchre(c2, this.trump))
        player.orderUpAsync()
        this.addUpdateDiff({ state: this.state, turn: dealer })
        this.flushDiffs()

        this.addUpdateDiff({ players: { [dealer]: { hand: [] } } })
        this.addUpdateDiff({ players: { [dealer]: { hand: player.hand.map(c => new cards.Card()) } } })
        this.flushDiffs(this.players.players.filter(p => p.index != dealer))

        this.addUpdateDiff({ players: { [dealer]: { hand: [] } } })
        this.addUpdateDiff({ players: { [dealer]: { hand: player.hand } } })
        this.flushDiffs([player].concat(this.players.kibitzers))
    }

    incomingDiscard(index, discard) {
        let player = this.players.get(index)

        if (this.state != CoreState.DISCARD) {
            log(`ERROR: Player "${player.id}" attempted to discard, but the game is not in discard state.`)
            return
        } else if (index != this.rounds[this.roundNumber].dealer) {
            log(`ERROR: Player "${player.id}" attempted to discard, but they are not the dealer.`)
            return
        } else if (!player.hand.some(c => c.matches(discard))) {
            log(`ERROR: Player "${player.id}" attempted to discard ${discard.toString()}, but they do not have that card.`)
            return
        }

        this.addUpdateDiff({}, { move: { human: player.human } })
        this.flushDiffs()
        let cardIndex = player.hand.findIndex(c => c.matches(discard))
        this.addRemoveDiff({ players: { [index]: { hand: [cardIndex] } } })
        this.flushDiffs([player].concat(this.players.kibitzers))
        this.addRemoveDiff({ players: { [index]: { hand: [0] } } })
        this.flushDiffs(this.players.players.filter(p => p.id != player.id))

        this.players.players[index].hand.splice(cardIndex, 1)

        let response = this.coreCpp.makeDiscard(discard.toNumber())
        this.turn = response.turn

        this.transitionToPlay()
    }

    transitionToPlay() {
        this.state = CoreState.PLAYING

        this.leader = this.turn

        this.canPlay = this.whatCanIPlay()
        this.players.players[this.turn].playAsync()

        this.flushDiffs()
        this.addUpdateDiff({ state: this.state, turn: this.turn })
        this.flushDiffs(this.players.players.filter(p => p.index != this.turn).concat(this.players.kibitzers))
        this.addUpdateDiff({ state: this.state, turn: this.turn }, { canPlay: this.canPlay })
        this.flushDiffs([this.players.players[this.turn]])
    }

    incomingPlay(index, card) {
        let player = this.players.get(index);

        if (index != this.turn) {
            log('ERROR: Player "' + player.id + '" attempted to play out of turn.');
            return;
        } else if (this.state != CoreState.PLAYING) {
            log('ERROR: Player "' + player.id + '" attempted to play, but the game is not in playing state.');
            return;
        } else if (!player.hand.some(c => c.matches(card))) {
            log('ERROR: Player "' + player.id + '" attempted to play ' + card.toString() + ', but they do not have that card.');
            return;
        } else if (!this.canPlay.filter(c => c.matches(card)).length) {
            log('ERROR: Player "' + player.id + '" attempted to play ' + card.toString() + ', failing to follow suit.');
            return;
        }

        this.addUpdateDiff({}, { move: { human: player.human } })
        this.flushDiffs()
        let cardIndex = player.hand.findIndex(c => c.matches(card))
        this.addRemoveDiff({ players: { [index]: { hand: [cardIndex] } } })
        this.flushDiffs([player].concat(this.players.kibitzers))
        this.addRemoveDiff({ players: { [index]: { hand: [0] } } })
        this.flushDiffs(this.players.players.filter(p => p.id != player.id))

        this.players.playReport(index, card);
        this.addUpdateDiff({
            players: {
                [player.index]: {
                    trick: card,
                    played: true
                }
            }
        })
        this.flushDiffs()

        let response = this.coreCpp.playCard(card.toNumber())
        this.turn = response.turn
        this.roundResult = response.roundResult
        this.scores = response.scores
        this.gameOver = response.gameOver
        this.addUpdateDiff({ roundResult: this.roundResult }, {})
        this.flushDiffs()

        if (response.trickWinner == -1) {
            this.canPlay = this.whatCanIPlay()
            this.players.players[this.turn].playAsync()

            this.flushDiffs()
            this.addUpdateDiff({ state: this.state, turn: this.turn })
            this.flushDiffs(this.players.players.filter(p => p.index != this.turn).concat(this.players.kibitzers))
            this.addUpdateDiff({ state: this.state, turn: this.turn }, { canPlay: this.canPlay })
            this.flushDiffs([this.players.players[this.turn]])
        } else {
            this.winners[this.winners.length - 1].push(this.turn);
            this.leaders[this.leaders.length - 1].push(this.leader);
            this.leader = this.turn;
            this.players.trickWinner(this.turn);
            this.trickOrder = new core.TrickOrder(this.trump.suit);

            this.addUpdateDiff({}, { trickWinner: this.leader })
            this.flushDiffs()
            this.addUpdateDiff(
                {
                    leader: this.leader,
                    players: this.players.players.map(p => ({
                        lastTrick: p.lastTrick,
                        trick: p.trick,
                        played: p.played,
                        taken: p.taken
                    }))
                }
            )
            this.flushDiffs()

            if (response.roundResult == -1) {
                this.canPlay = this.whatCanIPlay()
                this.players.players[this.turn].playAsync()

                this.flushDiffs()
                this.addUpdateDiff({ state: this.state, turn: this.turn })
                this.flushDiffs(this.players.players.filter(p => p.index != this.turn).concat(this.players.kibitzers))
                this.addUpdateDiff({ state: this.state, turn: this.turn }, { canPlay: this.canPlay })
                this.flushDiffs([this.players.players[this.turn]])
            } else {
                this.claims.push(-1);
                this.finishRound();
            }
        }
    }

    score(player) {
        return this.scores[player.index % (this.players.size() / 2)] - player.score
    }

    transitionFromRoundEnd() {
        if (this.gameOver) {
            this.sendPostGame();
        } else {
            if (this.roundNumber == this.rounds.length) {
                this.addARound(this.roundNumber);
                this.updateRounds();
            }
            this.deal();
        }
    }

    sendPostGame() {
        this.state = CoreState.POSTGAME;

        // win %
        //let winningScore = Math.max(...this.players.players.map(p => p.score))
        //let wb = new ml.BagModel(`./models/N${this.players.size()}/D${this.options.D}/T0/wb.txt`);
        //for (let j = 0; j < this.rounds.length; j++) {
        //    if (j >= this.players.players[0].scores.length) {
        //        break;
        //    }

        //    let v = new ml.BasicVector(this.players.players.map(p => p.scores[j]).concat([this.rounds.length - 1 - j]));
        //    let wbProbs = j == this.rounds.length - 1 ?
        //        this.players.players.map(p => p.score == winningScore ? 1 : 0) :
        //        wb.evaluate(v).toArray();
        //    this.players.addWbProbs(wbProbs);
        //}

        let json = {
            mode: this.game.mode,
            id: this.game.id,
            options: this.options.toDict(),
            rounds: this.rounds,
            trumps: this.trumps.map(c => c.toDict()),
            leaders: this.leaders,
            winners: this.winners,
            claims: this.claims,
            ...this.players.postGameData()
        };
        this.game.publishJson(json);
        this.addUpdateDiff({ state: this.state }, { postGameData: json })
        this.flushDiffs()
    }

    whatCanIPlay() {
        return this.coreCpp.whatCanIPlay().canPlay.map(c => new cards.Card(c))
    }
}

module.exports = {
    EuchreCore: EuchreCore
}