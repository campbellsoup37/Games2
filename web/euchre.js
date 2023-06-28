const log = require('./logging').log
core = require('./core')
const _euchre = require('./build/Release/euchre');

class EuchreCore extends core.Core {
    constructor(players, game, options) {
        super(players, game, options);
        this.coreCpp = new _euchre.EuchreCoreRandom();
    }

    verifyGameCanStart() {
        let N = this.players.players.filter(p => p.human).length + this.options.robots;
        return N == 4;
    }

    buildRounds() {
        this.rounds = [];

        for (let i = 0; i < 1; i++) {
            this.addARound(i)
        }
    }

    addARound(number) {
        this.rounds.push({ dealer: 0 });
    }

    transitionFromStart() {
        this.coreCpp.gameSetup()
        this.deal()
    }

    deal() {
        let data = this.coreCpp.deal()

        let hands = {
            hands: data.hands.map(h => h.map(c => new Card(c))),
            trump: [new Card(data.upCard)]
        }

        this.leader = data.leader;
        this.turn = data.leader;

        this.leaders.push([]);
        this.winners.push([]);

        this.players.newRound();
        this.sendDealerLeader();
        this.players.giveHands(hands);

        this.playNumber = 0;

        this.transitionFromDeal();
    }

    transitionFromDeal() {
        this.state = CoreState.PASSING;
        this.players.communicateTurn(this.state, this.turn);
    }
}

module.exports = {
    EuchreCore: EuchreCore
}