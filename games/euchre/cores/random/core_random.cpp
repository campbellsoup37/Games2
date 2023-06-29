#include "core_random.h"

std::shared_ptr<EuchrePlayer> EuchreCoreRandom::createPlayer(int index)
{
	return std::make_shared<EuchrePlayerRandom>(this, index);
}

void EuchrePlayerRandom::chooseTrump(int phase, bool stuck) {
	if (!stuck) {
		int x = core->rng() % 10000;
		if (x < 9057) {
			readiedTrumpChoice = {};
			return;
		}
	}

	int suit = -1;
	if (phase == 0) {
		suit = core->upCard.suit;
	} else {
		suit = core->rng() % 3;
		if (suit >= core->upCard.suit) {
			suit++;
		}
	}

	int x = core->rng() % 100;
	bool alone = x < 5;

	readiedTrumpChoice = {suit, alone};
}

void EuchrePlayerRandom::pickItUp() {
	readiedDiscard = chooseRandomCard();
}

void EuchrePlayerRandom::play(std::vector<const Card*>& canPlay) {
	int i = core->rng() % (int)canPlay.size();
	readiedPlay = *canPlay[i];
}

const Card& EuchrePlayerRandom::chooseRandomCard() {
	int h = (int)hand.size();
	for (const Card& card : hand) {
		if (core->rng() % h == 0) {
			return card;
		}
		h--;
	}
	// Shouldn't be reachable
	return *hand.begin();
}