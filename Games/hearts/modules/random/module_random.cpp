#include "hearts/core.h"
#include "module_random.h"

void HeartsAiModuleRandom::pass() {
	if (core->config.oregon && core->rng() % 2 == 0) {
		player->readiedPass.clear();
		return;
	}

	while (player->readiedPass.size() < core->passSize) {
		const Card& card = chooseRandomCard();
		bool alreadyChosen = false;
		for (const Card& card2 : player->readiedPass) {
			if (card.code == card2.code) {
				alreadyChosen = true;
				break;
			}
		}
		if (!alreadyChosen) {
			player->readiedPass.push_back(card);
		}
	}
}

void HeartsAiModuleRandom::play(std::vector<const Card*>& canPlay) {
	int i = core->rng() % (int)canPlay.size();
	player->readiedPlay = *canPlay[i];
}

void HeartsAiModuleRandom::shoot() {
	player->readiedShoot = ShootChoice::GO_DOWN;
}

const Card& HeartsAiModuleRandom::chooseRandomCard() {
	int h = (int)player->hand.size();
	for (const Card& card : player->hand) {
		if (core->rng() % h == 0) {
			return card;
		}
		h--;
	}
	// Shouldn't be reachable
	return *player->hand.begin();
}