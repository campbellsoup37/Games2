const log = require('./logging').log
const core = require('./core')
var ai = require('./ai');
var ml = require('./ml');

var CoreState = {
    PREGAME: 'OH_HELL_PREGAME',
    BIDDING: 'OH_HELL_BIDDING',
    PLAYING: 'OH_HELL_PLAYING',
    POSTGAME: 'OH_HELL_POSTGAME'
}

class OhHellPlayer extends core.Player {
    constructor() {
        super()
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
            bid: this.bid,
            bidded: this.bidded,
            taken: this.taken,
            score: this.score,
            hand: this.hand ? this.hand.map(c => visible ? c : new card.Card()) : [],
            trick: this.trick,
            played: this.played,
            lastTrick: this.lastTrick,
            decision: visible ? this.decision : undefined,
            bids: this.bids,
            scores: this.scores
        };
    }

    toPostGameDict() {
        return {
            id: this.id,
            name: this.name,
            index: this.index,
            team: this.team,
            human: this.human,
            hands: this.hands.map(h => h.map(c => c.toDict())),
            bids: this.bids,
            takens: this.takens,
            scores: this.scores,
            score: this.score,
            plays: this.plays.map(r => r.map(c => c.toDict())),
            wbProbs: this.wbProbs,
            bidQs: this.bidQs,
            makingProbs: this.makingProbs.map(r => r.map(t => t.map(pair => [pair[0].toDict(), pair[1]]))),
            aiBids: this.aiBids,
            diffs: this.diffs,
            lucks: this.lucks,
            hypoPointsLost: this.hypoPointsLost,
            mistakes: this.mistakes
        };
    }

    newGameReset() {
        this.score = 0;
        this.trick = new card.Card();
        this.lastTrick = new card.Card();
        this.bids = [];
        this.takens = [];
        this.scores = [];
        this.hands = [];
        this.plays = [];

        this.wbProbs = [];
        this.bidQs = [];
        this.makingProbs = [];
        this.aiBids = [];
        this.diffs = [];
        this.lucks = [];
        this.hypoPointsLost = [];
        this.mistakes = [];
    }

    newRoundReset() {
        this.bid = 0;
        this.taken = 0;
        this.bidded = false;
        this.trick = new card.Card();
        this.played = false;
        this.lastTrick = new card.Card();
        this.acceptedClaim = false;
        this.plays.push([]);
        this.cardsTaken = [];
        this.shownOut = [false, false, false, false];
        this.hadSuit = [false, false, false, false];

        this.makingProbs.push([]);
        this.roundMistakes = 0;
    }

    addBid(bid, offset) {
        this.bid = bid;
        this.bidded = true;
        this.bids.push(bid);

        let qs = this.bidQs[this.bidQs.length - 1];
        let aiBid = this.aiBids[this.aiBids.length - 1];
        if (!offset) {
            offset = 0;
        }
        this.hypoPointsLost.push(ai.pointsMean(qs, aiBid + offset) - ai.pointsMean(qs, this.bid + offset));
    }

    addPlay(card, isLead, follow) {
        this.trick = card;
        this.played = true;
        for (let i = 0; i < this.hand.length; i++) {
            if (this.hand[i].matches(card)) {
                this.hand.splice(i, 1);
            }
        }

        this.plays[this.plays.length - 1].push(card);

        let roundProbs = this.makingProbs[this.makingProbs.length - 1];
        let probs = roundProbs[roundProbs.length - 1];
        let maxProb = Math.max(...probs.map(pair => pair[1]));
        let myProb = probs.filter(pair => pair[0].matches(card))[0][1];
        this.roundMistakes += maxProb < 0.0001 ? 0 : Math.min(maxProb / myProb - 1, 1);

        this.hadSuit[card.suit] = true
        if (!isLead && card.suit != follow) {
            this.shownOut[follow] = true
        }
    }

    voidDealt(suit) {
        return this.shownOut[suit] && !this.hadSuit[suit];
    }

    addWbProb(p) {
        this.wbProbs.push(p);
    }

    startBid(data) {
        if (data.turn == this.index && !this.kibitzer) {
            this.bidAsync();
        }
    }

    async bidAsync() {
        let bid = await this.strategyModule.makeBid();
        this.bidReady(bid);
    }

    startPlay(data) {
        if (data.turn == this.index && !this.kibitzer) {
            this.playAsync();
        }
    }

    async playAsync() {
        let card = await this.strategyModule.makePlay();
        this.playReady(card);
    }

    startDecision(data) {
        if (!this.kibitzer) {
            this.decision = data;
            this.decisionAsync(data);
        }
    }

    async decisionAsync(data) {
        let choice = await this.strategyModule.makeDecision(data);
        this.decisionReady(choice);
    }

    addQs(qs) {
        this.bidQs.push(qs);
    }

    addAiBid(bid) {
        this.aiBids.push(bid);
    }

    addMakingProbs(probs) {
        this.makingProbs[this.makingProbs.length - 1].push(probs);
    }

    addDiff(diff) {
        this.diffs.push(diff);
    }

    addLuck(luck) {
        this.lucks.push(luck);
    }
}

class OhHellHumanPlayer extends core.createHumanPlayer(OhHellPlayer) {
    constructor(user, core) { super(user, core) }
}

class OhHellAiPlayer extends core.createAiPlayer(OhHellPlayer) {
    constructor(number, core) { super(number, core) }
}

class OhHellCore extends core.Core {
    constructor(players, game, options) {
        super(players, game, options)
        this.state = CoreState.PREGAME
    }

    createHumanPlayer(user) {
        return new OhHellHumanPlayer(user, this)
    }

    createAiPlayer(number) {
        return new OhHellAiPlayer(number, this)
    }

    isInGame() {
        return this.state == CoreState.BIDDING || this.state == CoreState.PLAYING
    }

    verifyGameCanStart() {
        let N = this.players.players.filter(p => p.human).length + this.options.robots;
        return N >= 2 && N <= 10;
    }

    sendGameState(player) {
        let choices = {}
        if (player.index == this.turn) {
            if (this.state == CoreState.BIDDING) {
                choices.cannotBid = this.whatCanINotBid(this.turn)
            } else if (this.state == CoreState.PLAYING) {
                choices.canPlay = this.whatCanIPlay(this.turn)
            }
        }
        this.addUpdateDiff(this.toDict(player.kibitzer ? -1 : player.index), choices)
        this.flushDiffs([player])
    }

    transitionFromStart() {
        try {
            let T = this.options.teams ? this.players.teams.filter(t => t.members.length > 0).length : 0;
            let path = `./models/N${this.players.size()}/D${this.options.D}/T${T}/ss.txt`;
            if (fs.existsSync(path)) {
                this.spreadsheet = fs.readFileSync(path, 'utf8');
                this.spreadsheet = this.spreadsheet.split('\r\n').map(row => row.split(','));
            }
        } catch (err) {
            this.spreadsheet = undefined;
        }
        this.deal();
    }

    getNextHands() {
        let deal = undefined;

        //if (debug) {
        //    deal = this.fullDeals[this.roundNumber];
        //} else {
        //    deal = this.deck.deal(this.players.size(), this.rounds[this.roundNumber].handSize, true);
        //}
        deal = this.deck.deal(this.players.size(), this.rounds[this.roundNumber].handSize, true);

        return {
            hands: deal.slice(0, this.players.size()),
            trump: deal[this.players.size()]
        };
    }

    buildRounds() {
        this.rounds = [];

        //this.rounds.push({ dealer: 0, handSize: 1, isOver: false });

        let maxH = Math.min(10, Math.floor(51 * this.options.D / this.players.size()));
        for (let i = maxH; i >= 2; i--) {
            this.rounds.push({ dealer: 0, handSize: i, isOver: false });
        }
        for (let i = 0; i < this.players.size(); i++) {
            this.rounds.push({ dealer: 0, handSize: 1, isOver: false });
        }
        for (let i = 2; i <= maxH; i++) {
            this.rounds.push({ dealer: 0, handSize: i, isOver: false });
        }
    }

    transitionFromDeal() {
        this.seen = new SeenCollection([], this.options.D);
        this.seen.add(this.trump);

        this.state = CoreState.BIDDING;

        //this.players.communicateTurn(this.state, this.turn, { ss: this.spreadsheet ? this.spreadsheet[0] : undefined });
        this.players.players[this.turn].bidAsync()

        this.flushDiffs()
        this.addUpdateDiff({ state: this.state, turn: this.turn })
        this.flushDiffs(this.players.players.filter(p => p.index != this.turn).concat(this.players.kibitzers))
        this.addUpdateDiff({ state: this.state, turn: this.turn }, { cannotBid: this.whatCanINotBid(this.turn) })
        this.flushDiffs([this.players.players[this.turn]])
    }

    incomingBid(index, bid) {
        let player = this.players.players[index]

        if (index != this.turn) {
            log('ERROR: Player "' + player.id + '" attempted to bid out of turn.');
            return;
        } else if (this.state != CoreState.BIDDING) {
            log('ERROR: Player "' + player.id + '" attempted to bid, but the game is not in bidding state.');
            return;
        } else if (bid < 0 || bid > this.getHandSize()) {
            log('ERROR: Player "' + player.id + '" attempted to bid ' + bid + ' with a hand size of ' + this.getHandSize() + '.');
            return;
        } else if (bid == this.whatCanINotBid(index)) {
            log('ERROR: Player "' + player.id + '" attempted to bid what they cannot bid as dealer.');
            return;
        }

        this.addUpdateDiff({}, { move: { human: player.human } })
        this.flushDiffs()

        let offset = 0;
        if (this.options.teams) {
            offset = this.players.teams[player.team].bid();
        }

        this.players.bidReport(index, bid, offset);
        this.addUpdateDiff({
            players: {
                [player.index]: {
                    bid: bid,
                    bidded: true,
                    bids: { [player.bids.length - 1]: bid }
                }
            }
        })

        this.turn = this.players.nextUnkicked(this.turn);

        let bidI = 0;
        for (let i = 0; i < this.players.size() && this.rounds[this.roundNumber].handSize == 1; i++) {
            let j = (this.rounds[this.roundNumber].dealer + 1 + i) % this.players.size();
            bidI += (this.players.get(j).bid << i);
        }

        let choices = {}
        let data = { canPlay: undefined, ss: this.spreadsheet && this.rounds[this.roundNumber].handSize == 1 ? this.spreadsheet[bidI] : undefined };
        if (this.players.allHaveBid()) {
            this.state = CoreState.PLAYING
            this.trickOrder = new core.TrickOrder(this.trump.suit)
            let canPlay = this.whatCanIPlay(this.turn)
            data.canPlay = canPlay
            choices.canPlay = canPlay
            this.players.players[this.turn].playAsync()
        } else {
            choices.cannotBid = this.whatCanINotBid(this.turn)
            this.players.players[this.turn].bidAsync()
        }

        //this.players.communicateTurn(this.state, this.turn, data)

        this.flushDiffs()
        this.addUpdateDiff({ state: this.state, turn: this.turn })
        this.flushDiffs(this.players.players.filter(p => p.index != this.turn).concat(this.players.kibitzers))
        this.addUpdateDiff({ state: this.state, turn: this.turn }, choices)
        this.flushDiffs([this.players.players[this.turn]])

        this.flushDiffs()
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
            log('ERROR: Player "' + player.id + '" attempted to play ' + card.toString() + ', failing to follow suit.');
            return;
        }

        this.seen.add(card);

        this.trickOrder.push(card, index);

        this.addUpdateDiff({}, { move: { human: player.human } })
        this.flushDiffs()
        let cardIndex = player.hand.findIndex(c => c.matches(card))
        this.addRemoveDiff({ players: { [index]: { hand: [cardIndex] } } })
        this.flushDiffs([player].concat(this.players.kibitzers))
        this.addRemoveDiff({ players: { [index]: { hand: [0] } } })
        this.flushDiffs(this.players.players.filter(p => p.id != player.id))

        this.players.playReport(index, card, index == this.leader, this.getLead().suit);
        this.addUpdateDiff({
            players: {
                [player.index]: {
                    trick: card,
                    played: true
                }
            }
        })
        this.flushDiffs()

        this.turn = this.players.nextUnkicked(this.turn);

        if (!this.players.allHavePlayed()) {
            let canPlay = this.whatCanIPlay(this.turn)
            //this.players.communicateTurn(this.state, this.turn, { canPlay: canPlay })
            this.players.players[this.turn].playAsync()

            this.flushDiffs()
            this.addUpdateDiff({ state: this.state, turn: this.turn })
            this.flushDiffs(this.players.players.filter(p => p.index != this.turn).concat(this.players.kibitzers))
            this.addUpdateDiff({ state: this.state, turn: this.turn }, { canPlay: canPlay })
            this.flushDiffs([this.players.players[this.turn]])
        } else {
            this.turn = this.trickOrder.getWinner();
            this.winners[this.winners.length - 1].push(this.turn);
            this.leaders[this.leaders.length - 1].push(this.leader);
            this.leader = this.turn;
            this.players.trickWinner(this.turn);
            this.trickOrder = new core.TrickOrder(this.trump.suit);
            this.playNumber++;

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
                let canPlay = this.whatCanIPlay(this.turn)
                //this.players.communicateTurn(this.state, this.turn, { canPlay: canPlay });
                this.players.players[this.turn].playAsync()

                this.flushDiffs()
                this.addUpdateDiff({ state: this.state, turn: this.turn })
                this.flushDiffs(this.players.players.filter(p => p.index != this.turn).concat(this.players.kibitzers))
                this.addUpdateDiff({ state: this.state, turn: this.turn }, { canPlay: canPlay })
                this.flushDiffs([this.players.players[this.turn]])
            } else {
                this.claims.push(-1);
                this.finishRound();
            }
        }
    }

    transitionFromRoundEnd() {
        if (this.roundNumber < this.rounds.length) {
            this.deal();
        } else {
            this.sendPostGame();
        }
    }

    sendPostGame() {
        this.state = CoreState.POSTGAME;

        // win %
        let winningScore = Math.max(...this.players.players.map(p => p.score))
        let wb = new ml.BagModel(`./models/N${this.players.size()}/D${this.options.D}/T0/wb.txt`);
        for (let j = 0; j < this.rounds.length; j++) {
            if (j >= this.players.players[0].scores.length) {
                break;
            }

            let v = new ml.BasicVector(this.players.players.map(p => p.scores[j]).concat([this.rounds.length - 1 - j]));
            let wbProbs = j == this.rounds.length - 1 ?
                this.players.players.map(p => p.score == winningScore ? 1 : 0) :
                wb.evaluate(v).toArray();
            this.players.addWbProbs(wbProbs);
        }

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
        //this.players.sendPostGameData(json);
        this.addUpdateDiff({ state: this.state }, { postGameData: json })
        this.flushDiffs()
    }

    hasColdClaim(index) {
        // reject if player is not on lead
        // TODO do something better
        if (index != this.leader || index != this.turn) {
            return false;
        }

        let allHands = new Array(this.players.size());
        for (const player of this.players.players) {
            let suits = [[], [], [], []];
            for (const card of player.hand) {
                if (player.index == index) {
                    suits[card.suit].push(card);
                } else {
                    suits[card.suit].unshift(card);
                }
            }
            allHands[player.index] = suits;
        }

        for (let j = 0; j < 4; j++) {
            if (j == this.trump.suit && Math.max(...allHands.map(suits => suits[j].length)) != allHands[index][j].length) {
                return false;
            }

            while (allHands[index][j].length > 0) {
                let myBest = allHands[index][j].pop();
                for (let i = 0; i < this.players.size(); i++) {
                    if (i == index || allHands[i][j].length == 0) {
                        continue;
                    }

                    let yourBest = allHands[i][j][allHands[i][j].length - 1];
                    if (myBest.comp(yourBest, this.trump.suit, myBest.suit) != 1) {
                        return false;
                    }

                    allHands[i][j].pop();
                }
            }
        }
        return true;
    }

    makeDecision(index, data) {
        if (data.name == 'claim') {
            if (this.claimer === undefined) {
                return;
            }

            this.players.respondToClaim(index, data.choice == 0);
        }
    }

    score(player) {
        let bid = this.options.teams ? this.players.teams[player.team].bid() : player.bid;
        let taken = this.options.teams ? this.players.teams[player.team].taken() : player.taken;
        return this.scoreFunc(bid, taken);
    }

    scoreFunc(bid, taken) {
        if (bid == taken) {
            return 10 + bid * bid;
        } else {
            let d = Math.abs(bid - taken);
            return -5 * d * (d + 1) / 2;
        }
    }

    // data for ai
    whatCanINotBid(index) {
        if (index != this.getDealer()) {
            return -1;
        } else {
            return this.getHandSize() - this.players.bidSum();
        }
    }

    highestMakeableBid(index, considerDealer) {
        let handSize = this.rounds[this.roundNumber].handSize;
        if (this.options.teams) {
            let team = this.players.players[index].team;
            let totalBid = 0;
            let ourBid = 0;
            this.players.players.forEach(p => {
                totalBid += p.bid;
                if (p.team == team) {
                    ourBid += p.bid;
                }
            });

            let dealerOnOurTeam = this.players.players[this.getDealer()].team == team;

            return Math.max(
                handSize - ourBid - (considerDealer && totalBid == ourBid && dealerOnOurTeam ? 1 : 0),
                0
            );
        } else {
            return handSize;
        }
    }

    getTrickCollection() {
        return new SeenCollection(this.players.players.map(p => p.trick), this.options.D);
    }

    getHandCollection(index) {
        return new SeenCollection(this.players.players[index].hand, this.options.D);
    }

    getCardsPlayedCollection(index) {
        let p = this.players.players[index];
        return new SeenCollection(p.plays[p.plays.length - 1].concat([this.trump]), this.options.D);
    }

    getSeenCollection() {
        return this.seen;
    }

    wants(index) {
        let player = this.players.players[index];
        let h = this.players.players[index].hand.length;

        if (!player.bidded) {
            return -1;
        }

        let myWants = player.bid - player.taken;
        myWants = Math.max(Math.min(myWants, h), 0);

        if (this.options.teams) {
            let teamWants = this.teamWants(player.team);
            myWants = Math.min(myWants, teamWants);
            if (teamWants == h) {
                myWants = teamWants;
            }
        }

        return myWants;
    }

    teamWants(number) {
        let team = this.players.teams[number];
        return Math.max(Math.min(
            team.bid() - team.taken(),
            this.rounds[this.roundNumber].handSize
        ), 0);
    }

    // TODO think about improving this by giving better information about the leader
    // potentially winning after getting canceled.
    cancelsRequired(index, card) {
        let trick = this.trickOrder;
        if (card !== undefined) {
            trick = trick.copy();
            trick.push(card, index);
        }

        let N = this.players.size();
        let ans = new Array(N);
        if (trick.order.length == 0) {
            ans[trick.leader] = 0;
        }

        //log(trick.order.map(e => [e.index, e.card.toString()]));

        let handSet = new Set();
        if (index !== undefined) {
            this.players.players[index].hand.filter(c => c !== card).forEach(c => handSet.add(c.toNumber()));
        }

        let i = 0;
        let max = (this.leader - this.turn + N - 1) % N;
        for (const entry of trick.order) {
            ans[entry.index] = i;

            if (this.options.D == 1) {
                break;
            }

            let uncancelableBecauseSeen = this.seen.matchesLeft(entry.card) == 0;
            let uncancelableBecauseInHand = handSet.has(entry.card.toNumber());
            if (uncancelableBecauseSeen || uncancelableBecauseInHand || i == max) {
                break;
            }

            i++;
        }

        for (i = 0; i < N; i++) {
            let j = (i + this.leader) % N;
            if (ans[j] === undefined) {
                if (i <= (this.turn - this.leader + N) % N) {
                    ans[j] = -2;
                } else {
                    ans[j] = -1;
                }
            }
        }

        return ans;
    }

    enableClaimRequest() {
        return this.state == CoreState.PLAYING && this.claimer === undefined
    }

    claimAccepted() {
        let winner = this.players.players[this.claimer];
        let remaining = winner.hand.length;
        if (!winner.trick.isEmpty()) {
            remaining++
        }

        winner.taken += remaining

        let updateDiff = { players: this.players.players.map(p => ({ hand: [], trick: new card.Card() })) }
        updateDiff.players[this.claimer].taken = winner.taken
        this.addUpdateDiff(updateDiff)
        this.flushDiffs()

        this.players.emitAll('claimresult', { accepted: true, claimer: this.claimer, remaining: remaining });

        this.finishRound();
    }
}

class SeenCollection {
    constructor(init, D) {
        this.D = D;
        this.initialize();
        for (const card of init) {
            this.add(card);
        }
    }

    initialize() {
        this.tracker = [new Array(13), new Array(13), new Array(13), new Array(13)];
        for (let val = 0; val < 13; val++) {
            for (let suit = 0; suit < 4; suit++) {
                this.tracker[suit][val] = val * this.D;
            }
        }
        this.counts = {};
    }

    add(card) {
        if (card === undefined || card.isEmpty()) {
            return;
        }

        for (let val = 0; val <= card.num - 2; val++) {
            this.tracker[card.suit][val]++;
        }

        let id = card.toNumber();
        if (this.counts[id] === undefined) {
            this.counts[id] = 1;
        } else {
            this.counts[id]++;
        }
    }

    cardValue(card) {
        return this.tracker[card.suit][card.num - 2];
    }

    cardsLeftOfSuit(suit) {
        return 13 * this.D - this.tracker[suit][0];
    }

    matchesLeft(card) {
        let count = this.counts[card.toNumber()];
        if (count === undefined) {
            count = 0;
        }
        return this.D - count;
    }

    // beware: the collections need to be disjoint for this to work
    merge(col) {
        for (let suit = 0; suit < 4; suit++) {
            let newCount = 13 * this.D;
            let leftCount = 13 * this.D;
            let rightCount = 13 * this.D;
            for (let val = 12; val >= 0; val--) {
                newCount -= (leftCount - this.tracker[suit][val]) + (rightCount - col.tracker[suit][val]) - this.D;
                leftCount = this.tracker[suit][val];
                rightCount = col.tracker[suit][val];
                this.tracker[suit][val] = newCount;
            }
        }

        for (const [id, count] of Object.entries(col.counts)) {
            if (this.counts[id] === undefined) {
                this.counts[id] = count;
            } else {
                this.counts[id] += count;
            }
        }
    }

    toArray() {
        let arr = [];
        for (let suit = 0; suit < 4; suit++) {
            let count = 13 * this.D;
            for (let val = 12; val >= 0; val--) {
                for (let c = 0; c < this.D - (count - this.tracker[suit][val]); c++) {
                    arr.push(new Card(val + 2, suit));
                }
                count = this.tracker[suit][val];
            }
        }
        return arr;
    }
}

module.exports = {
    OhHellCore: OhHellCore
}