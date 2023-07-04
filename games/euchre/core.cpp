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
	if (logFilename.size() > 0) {
		log.openFile(logFilename);
	}

	gameSetup();

	// One loop = one round
	while (!gameOver) {
		dealSetup();
		deal();
		chooseTrumpSetup();
		runChooseTrump();
		if (trumpPhase != EuchreTrumpPhase::PASSED) {
			if (orderedUp) {
				runOrderUp();
			}

			playSetup();
			runPlay();
			scored();
		}
	}

	if (log.logging) {
		log.closeFile();
	}
}

void EuchreCore::runChooseTrump() {
	while (trumpPhase != EuchreTrumpPhase::DECLARED && trumpPhase != EuchreTrumpPhase::PASSED) {
		int index = (leader + trumpIndex) % config.N;
		TrumpChoice& choice = getTrumpChoice(index);
		applyTrumpChoice(index, choice);
		trumpChoiceApplied(index, choice);
	}
}

void EuchreCore::runOrderUp() {
	int index = roundNumber % config.N;
	Card& card = this->getDiscard(index);
	discard(index, card);
	discarded(index, card);
}

void EuchreCore::runPlay() {
	while (roundResult == EuchreRoundResult::UNFINISHED) {
		int index = (leader + playIndex) % config.N;
		Card cardPlay = getCardPlay(index);
		playCard(index, cardPlay);
		cardPlayed(index, cardPlay);
	}
}

void EuchreCore::gameSetup() {
	gameOver = false;
	winningScore = -1;
	roundNumber = 0;
	for (int i = 0; i < config.N / 2; i++) {
		scores[i] = 0;
	}

	if (log.logging) {
		log.openList("rounds");
	}
}

void EuchreCore::dealSetup() {
	if (log.logging) {
		log.openDict();
	}

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
	orderedUp = false;

	if (log.logging) {
		log.openDict("trumpNaming");
	}
}

TrumpChoice& EuchreCore::getTrumpChoice(int index) {
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
	return players[index]->readiedTrumpChoice;
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
				roundNumber++;
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

void EuchreCore::trumpChoiceApplied(int index, TrumpChoice& choice) {
	if (log.logging) {
		log.close();
		log.write("choice", choice.toString());
		log.close();
		if (trumpPhase == EuchreTrumpPhase::DECLARED) {
			log.close();
		}
		if (trumpPhase == EuchreTrumpPhase::PASSED) {
			log.close();
			log.close();
		}
	}
}

Card& EuchreCore::getDiscard(int index) {
	if (log.logging) {
		log.openDict("discard");
		log.openDict("details");
	}

	players[index]->pickItUp();
	return players[index]->readiedDiscard;
}

void EuchreCore::discard(int index, const Card& card) {
	players[index]->hand.insert(upCard);
	players[index]->hand.erase(card);
}

void EuchreCore::discarded(int index, const Card& card) {
	if (log.logging) {
		log.close();
		log.write(index, card.toString());
		log.close();
	}
}

void EuchreCore::playSetup() {
	roundResult = EuchreRoundResult::UNFINISHED;
	trickIndex = 0;

	if (log.logging) {
		log.openList("tricks");
	}

	trickSetup();
}

void EuchreCore::trickSetup() {
	follow = -1;
	playIndex = 0;
	while ((leader + playIndex) % config.N == sittingOut) {
		playIndex++;
	}

	if (log.logging) {
		log.openDict();
	}
}

Card& EuchreCore::getCardPlay(int index) {
	if (log.logging) {
		log.openDict(index);
		log.openDict("details");
	}

	auto& player = players[index];
	std::vector<const Card*> canPlay;
	whatCanIPlay(player->hand, canPlay);
	player->play(canPlay);
	return player->readiedPlay;
}

void EuchreCore::playCard(int index, const Card& card) {
	players[index]->trick = card;
	deck.cardsNotPlayed.erase(card);

	int suit = EuchreDeck::trumpAdjustedSuit(card, trump);
	if (follow != -1 && suit != follow) {
		players[index]->showedOut[follow] = true;
	}

	if (follow == -1) {
		follow = suit;
	}

	do {
		playIndex++;
	} while (playIndex < config.N && (leader + playIndex) % config.N == sittingOut);
	if (playIndex == config.N) {
		evaluateTrick();
	}
}

void EuchreCore::evaluateTrick() {
	leader = trickWinner();
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

	if (roundResult != EuchreRoundResult::UNFINISHED) {
		score();
	}
}

void EuchreCore::score() {
	int team = declarer % (config.N / 2);
	switch (roundResult) {
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

	if (config.maxRounds > 0 && roundNumber == config.maxRounds) {
		gameOver = true;
	}
}

void EuchreCore::cardPlayed(int index, const Card& card) {
	players[index]->hand.erase(card);
	
	if (log.logging) {
		log.close();
		log.write("card", card.toString());
		log.close();
	}

	if (playIndex == config.N) {
		if (log.logging) {
			log.write("winner", leader);
			log.close();
		}

		trickIndex++;
		if (roundResult == EuchreRoundResult::UNFINISHED) {
			trickSetup();
		}
	}
}

void EuchreCore::scored() {
	if (log.logging) {
		log.close();
		log.openDict("scores");
		for (int i = 0; i < config.N / 2; i++) {
			log.write(i, scores[i]);
		}
		log.close();
		log.close();
	}
}

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

int EuchreCore::trickWinner() {
	int ans = -1;
	if (playIndex < config.N) {
		return ans;
	}
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