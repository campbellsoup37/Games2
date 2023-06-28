class Card {
    constructor(num, suit) {
        if (arguments.length == 0) {
            this.num = 0;
            this.suit = 0;
        } else if (arguments.length == 1) {
            this.num = num % 13 + 2
            this.suit = Math.floor(num / 13)
        } else {
            this.num = num;
            this.suit = suit;
        }
    }

    toDict() {
        return { num: this.num, suit: this.suit };
    }

    isEmpty() {
        return this.num == 0;
    }

    toString() {
        if (this.isEmpty()) {
            return '0';
        }

        let ans = '';
        if (this.num < 10) {
            ans += this.num;
        } else if (this.num == 10) {
            ans += 'T';
        } else if (this.num == 11) {
            ans += 'J';
        } else if (this.num == 12) {
            ans += 'Q';
        } else if (this.num == 13) {
            ans += 'K';
        } else if (this.num == 14) {
            ans += 'A';
        }
        if (this.suit == 0) {
            ans += 'C';
        } else if (this.suit == 1) {
            ans += 'D';
        } else if (this.suit == 2) {
            ans += 'S';
        } else if (this.suit == 3) {
            ans += 'H';
        }

        return ans;
    }

    fromString(str) {
        if (str[0] == 'T') {
            this.num = 10;
        } else if (str[0] == 'J') {
            this.num = 11;
        } else if (str[0] == 'Q') {
            this.num = 12;
        } else if (str[0] == 'K') {
            this.num = 13;
        } else if (str[0] == 'A') {
            this.num = 14;
        } else {
            this.num = parseInt(str[0]);
        }

        if (str[1] == 'C') {
            this.suit = 0;
        } else if (str[1] == 'D') {
            this.suit = 1;
        } else if (str[1] == 'S') {
            this.suit = 2;
        } else if (str[1] == 'H') {
            this.suit = 3;
        }

        return this;
    }

    toNumber() {
        return this.num - 2 + 13 * this.suit;
    }

    compSort(card) {
        if (this.suit == card.suit && this.num == card.num) {
            return 0;
        } else if (this.suit > card.suit || (this.suit == card.suit && this.num > card.num)) {
            return 1;
        } else {
            return -1;
        }
    }

    comp(card, trump, led) {
        let thisVal = this.compHelperVal(trump, led);
        let cardVal = card.compHelperVal(trump, led);
        if (thisVal > cardVal) {
            return 1;
        } else if (thisVal == cardVal) {
            return 0;
        } else {
            return -1;
        }
    }

    compHelperVal(trump, led) {
        let ans = this.num;
        if (this.suit == trump) {
            ans += 2000;
        } else if (this.suit == led) {
            ans += 1000;
        } else {
            return 0;
        }
        return ans;
    }

    matches(card) {
        return this.num == card.num && this.suit == card.suit;
    }
}

class Deck {
    constructor(D) {
        this.D = D;
    }

    initialize() {
        this.deck = []
        for (let d = 1; d <= this.D; d++) {
            for (let suit = 0; suit < 4; suit++) {
                for (let num = 2; num <= 14; num++) {
                    this.deck.push(new Card(num, suit));
                }
            }
        }
    }

    deal(N, h, trump) {
        let totalDealt = N * h;
        if (trump) {
            totalDealt++;
        }

        if (totalDealt > 52 * this.D) {
            log('ERROR: tried to deal ' + h + ' cards to ' + N + ' players.');
        }

        let out = [];

        // Shuffle in place
        for (let i = this.deck.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * i);
            let temp = this.deck[i];
            this.deck[i] = this.deck[j];
            this.deck[j] = temp;
        }

        for (let i = 0; i < N; i++) {
            let hand = this.deck.slice(i * h, (i + 1) * h);
            hand.sort((c1, c2) => c1.compSort(c2));
            out.push(hand);
        }

        if (trump) {
            out.push([this.deck[h * N]]);
        }

        return out;
    }
}

module.exports = {
    Card: Card,
    Deck: Deck
}
