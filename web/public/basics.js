export function cardToNumber(card) {
    return card.num - 2 + 13 * card.suit
}

export class Card {
    constructor(num, suit) {
        if (!arguments.length) {
            this.num = 0;
            this.suit = 0;
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

    gtSort(card) {
        if (this.suit == card.suit && this.num == card.num) {
            return 0;
        } else if (this.suit > card.suit || (this.suit == card.suit && this.num > card.num)) {
            return 1;
        } else {
            return -1;
        }
    }

    matches(card) {
        return this.num == card.num && this.suit == card.suit;
    }
}