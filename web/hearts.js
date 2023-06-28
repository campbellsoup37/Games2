const log = require('./logging').log
core = require('./core')

var CoreState = {
    PREGAME: 'HEARTS_PREGAME',
    PASSING: 'HEARTS_PASSING',
    PLAYING: 'HEARTS_PLAYING',
    POSTGAME: 'HEARTS_POSTGAME'
}

class HeartsCore extends core.Core {
    constructor(players, game, options) {
        super(players, game, options);
        this.state = CoreState.PREGAME
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
        // TODO state choices (shoot)
        //if (player.index == this.turn) {
        //    if (this.state == CoreState.BIDDING) {
        //        choices.cannotBid = this.whatCanINotBid(this.turn)
        //    } else if (this.state == CoreState.PLAYING) {
        //        choices.canPlay = this.whatCanIPlay(this.turn)
        //    }
        //}
        this.addUpdateDiff(this.toDict(player.kibitzer ? -1 : player.index), choices)
        this.flushDiffs([player])
    }

    transitionFromStart() {
        let cardsToRemove = [];
        switch (this.players.size()) {
            case 3:
                cardsToRemove = [new Card(2, 0)];
                this.totalPoints = 26;
                break;
            case 5:
                cardsToRemove = [new Card(2, 0), new Card(2, 1)];
                this.totalPoints = 26;
                break;
            case 6:
                cardsToRemove = [new Card(2, 0), new Card(2, 1), new Card(2, 2), new Card(2, 3)];
                this.totalPoints = 25;
                break;
            case 7:
                cardsToRemove = [new Card(2, 0), new Card(2, 1), new Card(2, 2)];
                this.totalPoints = 26;
                break;
            case 8:
                cardsToRemove = [new Card(2, 0), new Card(2, 1), new Card(2, 2), new Card(2, 3)];
                this.totalPoints = 25;
                break;
        }
        this.deck.initialize = function () {
            this.deck = []
            for (let d = 1; d <= this.D; d++) {
                for (let suit = 0; suit < 4; suit++) {
                    for (let num = 2; num <= 14; num++) {
                        this.deck.push(new Card(num, suit));
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
            trump: [new Card()]
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
            this.players.communicateTurn(this.state, this.turn);
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

        this.players.passReport(index, cards);

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

        this.firstTrick = true;
        this.heartsBroken = false;
        this.precalculatedPoints = undefined;
        this.shooter = -2; // -2 nobody has taking points, -1 points are split, otherwise index of shooter
        this.players.communicateTurn(this.state, this.turn, { canPlay: this.whatCanIPlay(this.turn) });
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

        let prev = (index + this.players.size() - 1) % this.players.size();
        let follow = this.players.players[prev].trick.suit;
        this.players.playReport(index, card, index == this.leader, follow);

        this.turn = this.players.nextUnkicked(this.turn);

        if (!this.players.allHavePlayed()) {
            this.players.communicateTurn(this.state, this.turn, { canPlay: this.whatCanIPlay(this.turn) });
        } else {
            this.turn = this.getWinner();
            this.winners[this.winners.length - 1].push(this.turn);
            this.leaders[this.leaders.length - 1].push(this.leader);
            this.leader = this.turn;
            let hasPoints = false;
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
            this.trickOrder = new TrickOrder(-1);
            this.playNumber++;
            this.firstTrick = false;

            if (!this.players.hasEmptyHand(this.turn)) {
                this.players.communicateTurn(this.state, this.turn, { canPlay: this.whatCanIPlay(this.turn) });
            } else {
                this.claims.push(-1);
                this.checkIfSomeoneShot();
            }
        }
    }

    claimAccepted() {
        this.checkIfSomeoneShot();
    }

    checkIfSomeoneShot() {
        if (this.shooter < 0) {
            this.finishRound();
        } else {
            let choices = [`Go down ${this.totalPoints}`, `Everyone else go up ${this.totalPoints}`];
            if (this.players.players[this.shooter].score + this.totalPoints == 100) {
                choices.push(`Go up ${this.totalPoints}`);
            }

            this.players.players[this.shooter].startDecision({
                name: 'shoot',
                prompt: 'You shot! Choose an option.',
                choices: choices
            });
        }
    }

    makeDecision(index, data) {
        if (data.name == 'shoot') {
            if (index != this.shooter) {
                return;
            }

            this.players.players[this.shooter].removeDecision();

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
        return new Card(this.players.size() == 4 ? 2 : 3, 0);
    }
}

module.exports = {
    HeartsCore: HeartsCore
}