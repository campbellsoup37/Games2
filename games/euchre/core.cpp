#include <iostream>

#include "core.h"

// EuchrePlayer

// EuchreCore
void EuchreCore::initialize() {
	for (int i = 0; i < config.N; i++) {
		players.emplace_back(createPlayer(i));
	}
	scores.resize(config.N / 2);
}

std::shared_ptr<EuchrePlayer> EuchreCore::createPlayer(int index) {
	return std::make_shared<EuchrePlayer>(this, index);
}

void EuchreCore::run(std::string logFilename) {
	gameSetup();

	if (logFilename.size() > 0) {
		log.openFile(logFilename);
	}

	if (log.logging) {
		log.openList("rounds");
	}

	// One loop = one round
	while (!gameOver) {
		if (log.logging) {
			log.openDict();
		}

		dealSetup();
		deal();
		chooseTrumpSetup();
		chooseTrump();
		if (trumpPhase != EuchreTrumpPhase::PASSED) {
			if (orderedUp) {
				orderUp();
			}

			playSetup();
			play();
			scored();

			if (log.logging) {
				log.openDict("scores");
				for (int i = 0; i < config.N / 2; i++) {
					log.write(i, scores[i]);
				}
				log.close();
			}
		}

		if (log.logging) {
			log.close();
		}

		if (config.maxRounds > 0 && roundNumber == config.maxRounds) {
			gameOver = true;
		}
	}

	if (log.logging) {
		log.closeFile();
	}
}

void EuchreCore::gameSetup() {
	gameOver = false;
	winningScore = -1;
	roundNumber = 0;
	for (int i = 0; i < config.N / 2; i++) {
		scores[i] = 0;
	}
}

void EuchreCore::dealSetup() {
	deck.shuffle();
	for (auto& player : players) {
		for (int i = 0; i < 4; i++) {
			player->showedOut[i] = false;
		}
		player->hand.clear();
		player->taken = 0;
	}
}

void EuchreCore::deal() {
	for (int i = 0; i < config.h; i++) {
		for (int j = 0; j < config.N; j++) {
			Card& card = *deck.draw();
			players[j]->hand.insert(card);
		}
	}

	upCard = *deck.draw();
	// Do not remove upCard from deck.cardsNotPlayed here because it could still be played later

	if (log.logging) {
		log.openDict("deal");
		for (auto& player : players) {
			log.openFlatList(player->index);
			for (const Card& card : player->hand) {
				log.write(card.toString());
			}
			log.close();
		}
		log.write("upCard", upCard.toString());
		log.close();
	}
}

void EuchreCore::chooseTrumpSetup() {
	leader = (roundNumber + 1) % config.N;
	trumpPhase = EuchreTrumpPhase::UP;
	trump = -1;
	alone = false;
	declarer = -1;
	dealerStuck = false;
	trumpIndex = 0;
}

void EuchreCore::chooseTrump() {
	if (log.logging) {
		log.openDict("trumpNaming");
	}

	while (trumpPhase != EuchreTrumpPhase::DECLARED && trumpPhase != EuchreTrumpPhase::PASSED) {
		int index = (leader + trumpIndex) % config.N;

		if (log.logging) {
			std::stringstream ss;
			if (trumpPhase == EuchreTrumpPhase::UP) {
				ss << "up," << index;
			}
			else if (trumpPhase == EuchreTrumpPhase::DOWN) {
				ss << "down," << index;
			}
			log.openDict(ss.str());
			log.openDict("details");
		}

		players[index]->chooseTrump(trumpPhase, dealerStuck);
		TrumpChoice& choice = players[index]->readiedTrumpChoice;

		if (log.logging) {
			log.close();
			log.write("choice", choice.toString());
			log.close();
		}
		applyTrumpChoice(index, choice);
		trumpChoiceApplied(index, choice);
	}

	if (log.logging) {
		log.close();
	}
}

void EuchreCore::applyTrumpChoice(int index, TrumpChoice& choice) {
	if (choice.pass) {
		if (trumpIndex == config.N - 1) {
			if (trumpPhase == EuchreTrumpPhase::UP) {
				trumpPhase = EuchreTrumpPhase::DOWN;
				deck.cardsNotPlayed.erase(upCard);
			}
			else if (trumpPhase == EuchreTrumpPhase::DOWN) {
				trumpPhase = EuchreTrumpPhase::PASSED;
			}
		}
		trumpIndex = (trumpIndex + 1) % config.N;
		dealerStuck = config.stickTheDealer && trumpPhase == EuchreTrumpPhase::DOWN && trumpIndex == config.N - 1;
	}
	else {
		trump = choice.suit;
		alone = choice.alone;
		declarer = index;
		orderedUp = trumpPhase == 0;
		sittingOut = alone ? (index + (config.N) / 2) % config.N : -1;
		trumpPhase = EuchreTrumpPhase::DECLARED;
		if (leader == sittingOut) {
			leader = (leader + 1) % config.N;
		}
	}
}

void EuchreCore::orderUp() {
	if (log.logging) {
		log.openDict("discard");
		log.openDict("details");
	}

	int dealer = roundNumber % config.N;
	auto& player = players[dealer];
	player->pickItUp();
	Card& discard = player->readiedDiscard;

	player->hand.insert(upCard);
	player->hand.erase(discard);

	if (log.logging) {
		log.close();
		log.write(dealer, discard.toString());
		log.close();
	}
}

void EuchreCore::playSetup() {
	roundResult = EuchreRoundResult::UNFINISHED;
}

void EuchreCore::trickSetup() {
	follow = -1;
}

void EuchreCore::play() {
	if (log.logging) {
		log.openList("tricks");
	}

	// One loop = one trick
	for (trickIndex = 0; trickIndex < config.h && roundResult == EuchreRoundResult::UNFINISHED; trickIndex++) {
		trickSetup();

		if (log.logging) {
			log.openDict();
		}

		// One loop = one play
		for (playIndex = 0; playIndex < config.N; playIndex++) {
			int i = (leader + playIndex) % config.N;
			if (i == sittingOut) {
				continue;
			}
			auto& player = players[i];

			if (log.logging) {
				log.openDict(player->index);
				log.openDict("details");
			}

			// Choose the card
			std::vector<const Card*> canPlay;
			whatCanIPlay(player->hand, canPlay);
			player->play(canPlay);
			Card cardPlay = player->readiedPlay;

			// Play the card
			playCard(player, cardPlay);
			cardPlayed(player, cardPlay);

			if (log.logging) {
				log.close();
				log.write("card", cardPlay.toString());
				log.close();
			}
		}

		evaluateTrick();

		if (log.logging) {
			log.write("winner", leader);
			log.close();
		}
	}

	if (log.logging) {
		log.close();
	}
}

void EuchreCore::playCard(std::shared_ptr<EuchrePlayer> player, const Card& card) {
	player->trick = card;
	deck.cardsNotPlayed.erase(card);

	int suit = EuchreDeck::trumpAdjustedSuit(card, trump);
	if (follow != -1 && suit != follow) {
		player->showedOut[follow] = true;
	}

	if (follow == -1) {
		follow = suit;
	}
}

void EuchreCore::cardPlayed(std::shared_ptr<EuchrePlayer> player, const Card& card) {
	player->hand.erase(card);
}

void EuchreCore::evaluateTrick() {
	leader = trickWinner(follow);
	players[leader]->taken++;

	int partner = (declarer + config.N / 2) % config.N;
	int taken = players[declarer]->taken + players[partner]->taken;
	int lost = trickIndex + 1 - taken;
	if (lost > config.h / 2) {
		roundResult = EuchreRoundResult::EUCHRED;
	}
	else if (taken > config.h / 2 && lost >= 1) {
		roundResult = EuchreRoundResult::MADE;
	}
	else if (taken == config.h) {
		roundResult = EuchreRoundResult::MADE_ALL;
	}

	score();
}

void EuchreCore::score() {
	int team = declarer % (config.N / 2);
	switch (roundResult) {
	case UNFINISHED:
		return;
	case EUCHRED:
		for (int i = 1; i < config.N / 2; i++) {
			int otherTeam = (declarer + i) % (config.N / 2);
			scores[otherTeam] += 2;
		}
		break;
	case MADE:
		scores[team] += 1;
		break;
	case MADE_ALL:
		if (alone) {
			scores[team] += 4;
		}
		else {
			scores[team] += 2;
		}
		break;
	default:
		break;
	}

	int highestScore = -1;
	for (int i = 0; i < config.N / 2; i++) {
		if (scores[i] > highestScore) {
			highestScore = scores[i];
		}
	}
	if (highestScore >= config.winningPoints) {
		gameOver = true;
		winningScore = highestScore;
	}

	roundNumber++;
}

void EuchreCore::scored() {}

void EuchreCore::whatCanIPlay(Hand& hand, std::vector<const Card*>& canPlay) {
	for (const Card& card : hand) {
		int suit = EuchreDeck::trumpAdjustedSuit(card, trump);

		if (suit == follow || follow == -1) {
			canPlay.push_back(&card);
		}
	}

	if (!canPlay.empty()) {
		return;
	}
	for (const Card& card : hand) {
		canPlay.push_back(&card);
	}
}

int EuchreCore::trickWinner(int follow)
{
	int ans = -1;
	int winningSuit = follow;
	int winningNum = -1;
	for (auto& player : players) {
		if (player->index == sittingOut) {
			continue;
		}

		int suit = EuchreDeck::trumpAdjustedSuit(player->trick, trump);
		int num = EuchreDeck::trumpAdjustedNum(player->trick, trump);
		if (suit != follow && suit != trump) {
			continue;
		}
		if (winningSuit == trump && suit != trump) {
			continue;
		}
		if ((winningSuit != trump && suit == trump) || (num > winningNum)) {
			ans = player->index;
			winningSuit = suit;
			winningNum = num;
		}
	}
	return ans;
}