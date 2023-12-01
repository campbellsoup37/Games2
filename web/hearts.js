const log = require('./logging').log
card = require('./card')
core = require('./core')

var CoreState = {
    PREGAME: 'HEARTS_PREGAME',
    PASSING: 'HEARTS_PASSING',
    PLAYING: 'HEARTS_PLAYING',
    POSTGAME: 'HEARTS_POSTGAME'
}

class HeartsPlayer extends core.Player {
    constructor() {
        super()
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
            taken: this.taken,
            score: this.score,
            hand: this.hand ? this.hand.map(c => visible ? c : new card.Card()) : [],
            trick: this.trick,
            played: this.played,
            lastTrick: this.lastTrick,
            decision: visible ? this.decision : undefined,
            scores: this.scores,
            pass: this.pass ? this.pass.map(c => visible ? c : new card.Card()) : [],
            passed: this.passed
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
            plays: this.plays.map(r => r.map(c => c.toDict()))
        };
    }

    newGameReset() {
        this.score = 0;
        this.trick = new card.Card();
        this.lastTrick = new card.Card();
        this.takens = [];
        this.scores = [];
        this.hands = [];
        this.plays = [];
        this.passes = [];
    }

    newRoundReset() {
        this.taken = 0;
        this.trick = new card.Card();
        this.played = false;
        this.lastTrick = new card.Card();
        this.acceptedClaim = false;
        this.plays.push([]);
        this.pass = [];
        this.passed = false;
        this.cardsTaken = [];
    }

    addPlay(card) {
        this.trick = card;
        this.played = true;
        for (let i = 0; i < this.hand.length; i++) {
            if (this.hand[i].matches(card)) {
                this.hand.splice(i, 1);
            }
        }

        this.plays[this.plays.length - 1].push(card);
    }

    addPass(cards) {
        this.pass = cards;
        this.passed = true;
        this.passes.push(cards);
    }

    incTaken(cards) {
        super.incTaken()
        this.cardsTaken = this.cardsTaken.concat(cards)
    }

    async passAsync(delay) {
        let cards = await this.strategyModule.makePass();
        this.passReady(cards, delay);
    }

    addMakingProbs(probs) { }
}

class HeartsHumanPlayer extends core.createHumanPlayer(HeartsPlayer) {
    constructor(user, core) { super(user, core) }
}

class HeartsAiPlayer extends core.createAiPlayer(HeartsPlayer) {
    constructor(number, core) { super(number, core) }
}

class HeartsCore extends core.Core {
    constructor(players, game, options) {
        super(players, game, options);
        this.state = CoreState.PREGAME
    }

    createHumanPlayer(user) {
        return new HeartsHumanPlayer(user, this)
    }

    createAiPlayer(number) {
        return new HeartsAiPlayer(number, this)
    }

    // index = hide all hands except for index
    toDict(index) {
        return {
            options: this.options,
            rounds: this.rounds,
            roundNumber: this.roundNumber,
            leader: this.leader,
            state: this.state,
            turn: this.turn,
            players: this.players.playersDict(index),
            kibitzers: this.players.kibitzersDict(index)
        };
    }

    isInGame() {
        return this.state == CoreState.PASSING || this.state == CoreState.PLAYING
    }

    verifyGameCanStart() {
        let N = this.players.players.filter(p => p.human).length + this.options.robots;
        return N >= 3 && N <= 8;
    }

    sendGameState(player) {
        let choices = {}
        if (player.index == this.turn) {
            if (this.state == CoreState.PLAYING) {
                choices.canPlay = this.whatCanIPlay(this.turn)
            }
        }
        this.addUpdateDiff(this.toDict(player.kibitzer ? -1 : player.index), choices)
        this.flushDiffs([player])
    }

    transitionFromStart() {
        let cardsToRemove = [];
        switch (this.players.size()) {
            case 3:
                cardsToRemove = [new card.Card(2, 0)];
                this.totalPoints = 26;
                break;
            case 5:
                cardsToRemove = [new card.Card(2, 0), new card.Card(2, 1)];
                this.totalPoints = 26;
                break;
            case 6:
                cardsToRemove = [new card.Card(2, 0), new card.Card(2, 1), new card.Card(2, 2), new card.Card(2, 3)];
                this.totalPoints = 25;
                break;
            case 7:
                cardsToRemove = [new card.Card(2, 0), new card.Card(2, 1), new card.Card(2, 2)];
                this.totalPoints = 26;
                break;
            case 8:
                cardsToRemove = [new card.Card(2, 0), new card.Card(2, 1), new card.Card(2, 2), new card.Card(2, 3)];
                this.totalPoints = 25;
                break;
        }
        this.deck.initialize = function () {
            this.deck = []
            for (let d = 1; d <= this.D; d++) {
                for (let suit = 0; suit < 4; suit++) {
                    for (let num = 2; num <= 14; num++) {
                        this.deck.push(new card.Card(num, suit));
                    }
                }
            }
            this.deck = this.deck.filter(c1 => cardsToRemove.filter(c2 => c1.matches(c2)).length == 0);
        }

        this.deal();
    }

    getNextHands() {
        return {
            hands: this.deck.deal(this.players.size(), this.rounds[this.roundNumber].handSize, false),
            trump: [new card.Card()]
        };
    }

    buildRounds() {
        this.rounds = [];

        for (let i = 0; i < this.players.size(); i++) {
            this.addARound(i)
        }
    }

    addARound(number) {
        let i = (number + 1) % this.players.size();
        let pass = -Math.pow(-1, i) * Math.floor((i + 1) / 2);
        this.rounds.push({ dealer: 0, handSize: Math.floor(52 / this.players.size()), pass: pass });
    }

    transitionFromDeal() {
        if (this.rounds[this.roundNumber].pass == 0) {
            this.transitionToPlay();
        } else {
            this.state = CoreState.PASSING;
            //this.players.communicateTurn(this.state, this.turn);
            for (let player of this.players.players) {
                player.passAsync(0)
            }
            this.addUpdateDiff({ state: this.state })
            this.flushDiffs()
        }
    }

    incomingPass(index, cards) {
        let player = this.players.get(index);

        if (this.state != CoreState.PASSING) {
            log('ERROR: Player "' + player.id + '" attempted to pass, but the game is not in passing state.');
            return;
        } else if (cards.some(c1 => player.hand.filter(c2 => c2.matches(c1)).length == 0)) {
            log('ERROR: Player "' + player.id + '" attempted to pass [' + cards + '], but they do not have all of those cards.');
            return;
        } else if (cards.length != this.howManyToPass() && cards.length != 0) {
            log('ERROR: Player "' + player.id + '" attempted to pass ' + this.howManyToPass() + ' cards.');
            return;
        }

        this.addUpdateDiff({}, { move: { human: player.human && !player.replacedByRobot } })
        this.flushDiffs()

        this.players.passReport(index, cards)

        let cardIndices = cards.map(card => player.hand.findIndex(c => c.matches(card)))
        player.hand = player.hand.filter(c1 => !cards.some(c2 => c2.matches(c1)))

        this.addRemoveDiff({ players: { [index]: { hand: cardIndices } } })
        this.addUpdateDiff({
            players: {
                [player.index]: {
                    pass: cards,
                    passed: true,
                    passedTo: -1
                }
            }
        })
        this.flushDiffs([player].concat(this.players.kibitzers))
        this.addRemoveDiff({ players: { [index]: { hand: [...Array(cards.length).keys()] } } })
        this.addUpdateDiff({
            players: {
                [player.index]: {
                    pass: cards.map(c => new card.Card()),
                    passed: true,
                    passedTo: -1
                }
            }
        })
        this.flushDiffs(this.players.players.filter(p => p.id != player.id))

        if (this.players.allHavePassed()) {
            this.transitionToPlay();
        }
    }

    transitionToPlay() {
        this.players.performPass(this.rounds[this.roundNumber].pass);
        this.state = CoreState.PLAYING;

        for (const player of this.players.players) {
            if (player.hand.filter(c => c.matches(this.getLeadCard())).length) {
                this.turn = player.index;
                this.leader = player.index;
                break;
            }
        }
        this.addUpdateDiff({ leader: this.leader })

        this.firstTrick = true;
        this.heartsBroken = false;
        this.precalculatedPoints = undefined;
        this.shooter = -2; // -2 nobody has taking points, -1 points are split, otherwise index of shooter
        //this.players.communicateTurn(this.state, this.turn, { canPlay: this.whatCanIPlay(this.turn) });
        this.players.players[this.turn].playAsync(0)

        this.flushDiffs()
        this.addUpdateDiff({ state: this.state, turn: this.turn })
        this.flushDiffs(this.players.players.filter(p => p.index != this.turn).concat(this.players.kibitzers))
        this.addUpdateDiff({ state: this.state, turn: this.turn }, { canPlay: this.whatCanIPlay(this.turn) })
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
        } else if (!this.whatCanIPlay(index).filter(c => c.matches(card)).length) {
            log('ERROR: Player "' + player.id + '" attempted to play ' + card.toString() + ', which is illegal.');
            return;
        }

        if (card.suit == 3) {
            this.heartsBroken = true;
        }

        this.addUpdateDiff({}, { move: { human: player.human && !player.replacedByRobot } })
        this.flushDiffs()
        let cardIndex = player.hand.findIndex(c => c.matches(card))
        this.addRemoveDiff({ players: { [index]: { hand: [cardIndex] } } })
        this.flushDiffs([player].concat(this.players.kibitzers))
        this.addRemoveDiff({ players: { [index]: { hand: [0] } } })
        this.flushDiffs(this.players.players.filter(p => p.id != player.id))

        let prev = (index + this.players.size() - 1) % this.players.size();
        let follow = this.players.players[prev].trick.suit;
        this.players.playReport(index, card, index == this.leader, follow);
        this.addUpdateDiff({
            players: {
                [player.index]: {
                    trick: card,
                    played: true
                }
            }
        })
        this.addUpdateDiff({}, { sound: { name: 'card' } })
        this.flushDiffs()

        this.turn = this.players.nextUnkicked(this.turn);

        if (!this.players.allHavePlayed()) {
            //this.players.communicateTurn(this.state, this.turn, { canPlay: this.whatCanIPlay(this.turn) });
            this.players.players[this.turn].playAsync(0)

            this.flushDiffs()
            this.addUpdateDiff({ state: this.state, turn: this.turn })
            this.flushDiffs(this.players.players.filter(p => p.index != this.turn).concat(this.players.kibitzers))
            this.addUpdateDiff({ state: this.state, turn: this.turn }, { canPlay: this.whatCanIPlay(this.turn) })
            this.flushDiffs([this.players.players[this.turn]])
        } else {
            this.turn = this.getWinner();
            this.winners[this.winners.length - 1].push(this.turn);
            this.leaders[this.leaders.length - 1].push(this.leader);
            this.leader = this.turn;
            for (const player of this.players.players) {
                let playerCard = player.trick;
                if (playerCard.suit == 3 || (playerCard.suit == 2 && playerCard.num == 12)) {
                    if (this.shooter == -2) {
                        this.shooter = this.turn;
                    } else if (this.shooter != this.turn) {
                        this.shooter = -1;
                    }
                    break;
                }
            }
            this.players.trickWinner(this.turn);
            this.trickOrder = new core.TrickOrder(-1);
            this.playNumber++;
            this.firstTrick = false;

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

            if (!this.players.hasEmptyHand(this.turn)) {
                //this.players.communicateTurn(this.state, this.turn, { canPlay: this.whatCanIPlay(this.turn) });
                let canPlay = this.whatCanIPlay(this.turn)
                this.players.players[this.turn].playAsync(0)

                this.flushDiffs()
                this.addUpdateDiff({ state: this.state, turn: this.turn })
                this.flushDiffs(this.players.players.filter(p => p.index != this.turn).concat(this.players.kibitzers))
                this.addUpdateDiff({ state: this.state, turn: this.turn }, { canPlay: canPlay })
                this.flushDiffs([this.players.players[this.turn]])
            } else {
                this.claims.push(-1);
                this.checkIfSomeoneShot();
            }
        }
    }

    enableClaimRequest() {
        return this.state == CoreState.PLAYING && this.claimer === undefined
    }

    claimAccepted() {
        let winner = this.players.players[this.claimer]
        let remaining = winner.hand.length
        if (!winner.trick.isEmpty()) {
            remaining++
        }
        winner.taken += remaining

        let remainingCards = this.players.players.reduce((r, p) => r.concat(p.hand).concat(p.trick.isEmpty() ? [] : p.trick), [])
        for (let card of remainingCards) {
            if (card.suit == 3 || (card.suit == 2 && card.num == 12)) {
                if (this.shooter == -2) {
                    this.shooter = this.claimer
                } else if (this.shooter != this.claimer) {
                    this.shooter = -1
                }
                break
            }
        }
        winner.cardsTaken = winner.cardsTaken.concat(remainingCards)

        let updateDiff = { players: this.players.players.map(p => ({ hand: [], trick: new card.Card() })) }
        updateDiff.players[this.claimer].taken = winner.taken
        this.addUpdateDiff(updateDiff)
        this.flushDiffs()

        this.players.emitAll('claimresult', { accepted: true, claimer: this.claimer, remaining: remaining });

        this.checkIfSomeoneShot();
    }

    checkIfSomeoneShot() {
        if (this.shooter < 0) {
            this.finishRound();
        } else {
            let choices = [`Go down ${this.totalPoints}`, `Everyone else go up ${this.totalPoints}`]
            if (this.players.players[this.shooter].score + this.totalPoints == 100) {
                choices.push(`Go up ${this.totalPoints}`)
            }

            let shooter = this.players.players[this.shooter]
            shooter.startDecision({
                name: 'shoot',
                prompt: 'You shot! Choose an option.',
                choices: choices
            })
            this.addUpdateDiff({ players: { [this.shooter]: { decision: shooter.decision } } })
            this.flushDiffs([shooter])
        }
    }

    makeDecision(index, data) {
        if (data.name == 'shoot') {
            if (index != this.shooter) {
                return;
            }

            this.players.players[this.shooter].removeDecision();
            this.addRemoveDiff({ players: { [this.shooter]: ['decision'] } })
            this.flushDiffs([this.players.players[this.shooter]])

            this.precalculatedPoints = [];
            for (let i = 0; i < this.players.size(); i++) {
                if (data.choice == 0) {
                    if (i == this.shooter) {
                        this.precalculatedPoints.push(-this.totalPoints);
                    } else {
                        this.precalculatedPoints.push(0);
                    }
                } else if (data.choice == 1) {
                    if (i == this.shooter) {
                        this.precalculatedPoints.push(0);
                    } else {
                        this.precalculatedPoints.push(this.totalPoints);
                    }
                } else if (data.choice == 2) {
                    if (i == this.shooter) {
                        this.precalculatedPoints.push(this.totalPoints);
                    } else {
                        this.precalculatedPoints.push(0);
                    }
                }
            }
            this.finishRound();
        } else if (data.name == 'claim') {
            if (this.claimer === undefined) {
                return;
            }

            this.players.respondToClaim(index, data.choice == 0);
        }
    }

    getWinner() {
        let ref = this.options.oregon ? (this.leader + this.players.size() - 1) % this.players.size() : this.leader;
        let suit = this.players.players[ref].trick.suit;
        let winner = -1;
        let max = 0;
        for (const player of this.players.players) {
            if (player.trick.suit == suit && player.trick.num > max) {
                winner = player.index;
                max = player.trick.num;
            }
        }
        return winner;
    }

    score(player) {
        if (this.precalculatedPoints !== undefined) {
            // This will be reached if someone shoots.
            return this.precalculatedPoints[player.index];
        }

        let hearts = 0;
        let queen = false;
        for (const card of player.cardsTaken) {
            if (card.suit == 3) {
                hearts++;
            } else if (card.suit == 2 && card.num == 12) {
                queen = true;
            }
        }

        let points = hearts == 0 && !queen && this.options.oregon ? 10 : hearts + (queen ? 13 : 0);

        if (player.score + points == 100) {
            points = -player.score;
        }

        return points;
    }

    transitionFromRoundEnd() {
        if (this.players.players.some(p => p.score > 100)) {
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

    // data for ai
    howManyToPass() {
        let ans = [0, 0, 0, 4, 3, 2, 2, 2, 1];
        return ans[this.players.size()];
    }

    whatCanIPlay(index) {
        let hand = this.players.players[index].hand;

        // if first trick, must lead 3C or 2C
        if (this.firstTrick) {
            let leadCard = this.getLeadCard();
            let lead = hand.filter(c => c.matches(leadCard));
            if (lead.length) {
                return lead;
            }
        }

        let ref = this.options.oregon ? (index + this.players.size() - 1) % this.players.size() : this.leader;
        let follow = index == this.leader ? -1 : this.players.players[ref].trick.suit;
        if (follow == -1) { // leading

            // check if hearts broken
            if (!this.heartsBroken) {
                let nonhearts = hand.filter(c => c.suit != 3);
                if (nonhearts.length > 0) {
                    return nonhearts;
                }
            }

            return hand;
        } else { // following
            let ans = hand.filter(c => c.suit == follow);
            if (ans.length == 0) {
                ans = hand;
            }

            // don't play points on first round unless you have to
            if (this.firstTrick) {
                let nonpoints = ans.filter(c => c.suit != 3 && !(c.suit == 2 && c.num == 12));
                if (nonpoints.length > 0) {
                    return nonpoints;
                }
            }

            return ans;
        }
    }

    getLeadCard() {
        return new card.Card(this.players.size() == 4 ? 2 : 3, 0);
    }
}

module.exports = {
    HeartsCore: HeartsCore
}