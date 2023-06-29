#include <iostream>

#include "core.h"
#include "modules/module.h"

// HeartsPlayer
void HeartsPlayer::setModule(HeartsAiModule* module) {
	this->module = module;
	module->setCoreAndPlayer(&core, this);
}

// HeartsCore
HeartsCore::HeartsCore(HeartsConfig& config) : config(config), rng(config.seed), deck(config.N, rng), passSize(HeartsStaticData::passCount(config.N)), leadCode(HeartsStaticData::leadCode(config.N)), shootPoints(HeartsStaticData::shootPoints(config.N)) {
	for (int i = 0; i < config.N; i++) {
		players.emplace_back(*this, i);
	}
}

void HeartsCore::setModule(int index, HeartsAiModule* module) {
	players[index].setModule(module);
}

void HeartsCore::run(std::string logFilename) {
	gameOver = false;
	roundNumber = 0;
	for (HeartsPlayer& player : players) {
		player.score = 0;
	}

	for (HeartsPlayer& player : players) {
		player.module->notifyGameStart();
	}

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

		deal();
		pass();
		play();

		ShootChoice shootChoice = NO_SHOOT;
		if (shooter >= 0) {
			players[shooter].module->shoot();
			shootChoice = players[shooter].readiedShoot;
		}
		score(shootChoice);
		notifyPlay(); // A bit awkward. Feels like we are catering too much to module_markov.

		if (log.logging) {
			log.openDict("scores");
			for (HeartsPlayer& player : players) {
				log.write(player.index, player.score);
			}
			log.write("shooter", shooter);
			log.close();
			log.close();
		}

		/*std::cout << roundNumber << ":";
		for (HeartsPlayer& player : players) {
			std::cout << " " << player.score;
		}
		std::cout << std::endl;*/

		roundNumber++;
	}

	if (log.logging) {
		log.closeFile();
	}
}

void HeartsCore::deal() {
	deck.shuffle();
	for (HeartsPlayer& player : players) {
		player.cardsPlayed.clear();
		for (int i = 0; i < 4; i++) {
			player.showedOut[i] = false;
		}
	}

	for (int i = 0; !deck.empty(); i = (i + 1) % config.N) {
		Card& card = *deck.draw();
		players[i].hand.insert(card);
		if (card.code == leadCode) {
			leader = i;
		}
	}

	if (log.logging) {
		log.openDict("deal");
		for (HeartsPlayer& player : players) {
			log.openFlatList(player.index);
			for (const Card& card : player.hand) {
				log.write(card.toString());
			}
			log.close();
		}
		log.close();
	}
}

void HeartsCore::pass() {
	state = HeartsCoreState::PASSING;

	passOffset = HeartsStaticData::passOffset(config.N, roundNumber);
	if (passOffset == 0) {
		return;
	}

	if (log.logging) {
		log.openDict("pass");
	}

	for (HeartsPlayer& player : players) {
		if (log.logging) {
			log.openDict(player.index);
			log.openDict("details");
		}

		player.module->pass();

		if (log.logging) {
			log.close();
			log.openFlatList("cards");
			if (player.isPassing()) {
				for (const Card& card : player.readiedPass) {
					log.write(card.toString());
				}
			}
			log.close();
			log.close();
		}
	}

	if (log.logging) {
		log.close();
	}

	for (HeartsPlayer& player : players) {
		player.cardsPassed.clear();
		player.cardsReceived.clear();

		if (!player.isPassing()) {
			continue;
		}
		int receiverIndex = (player.index + passOffset) % config.N;
		while (!players[receiverIndex].isPassing()) {
			receiverIndex = (receiverIndex + passOffset) % config.N;
		}
		if (receiverIndex == player.index) {
			continue;
		}

		HeartsPlayer& receiver = players[receiverIndex];
		for (const Card& card : player.readiedPass) {
			if (card.code == leadCode) {
				leader = receiver.index;
			}

			player.cardsPassed.push_back(card.code);
			receiver.cardsReceived.push_back(card.code);

			receiver.hand.insert(card);
			player.hand.erase(card);
		}
	}

	for (HeartsPlayer& player : players) {
		player.module->notifyPass();
	}
}

void HeartsCore::play() {
	state = HeartsCoreState::PLAYING;

	Card cardPlay(leadCode);
	heartsBroken = false;
	shooter = -2;
	trickCount = (int)players[0].hand.size();

	if (log.logging) {
		log.openList("tricks");
	}

	// One loop = one trick
	for (trickIndex = 0; trickIndex < trickCount; trickIndex++) {
		follow = -1;
		points = 0;

		if (log.logging) {
			log.openDict();
		}

		// One loop = one play
		for (int turnIndex = 0; turnIndex < config.N; turnIndex++) {
			int i = (leader + turnIndex) % config.N;
			HeartsPlayer& player = players[i];

			if (log.logging) {
				log.openDict(player.index);
				log.openDict("details");
			}

			// Choose the card
			std::vector<const Card*> canPlay;
			whatCanIPlay(player.hand, trickIndex == 0, canPlay);
			player.module->play(canPlay);
			cardPlay = player.readiedPlay;

			// Play the card
			playCard(player, cardPlay);
			player.hand.erase(cardPlay);
			lastPlayedIndex = player.index;

			if (turnIndex < config.N - 1) {
				notifyPlay();
			}

			if (log.logging) {
				log.close();
				log.write("card", cardPlay.toString());
				log.close();
			}
		}

		evaluateTrick();

		if (log.logging) {
			log.write("winner", leader);
			log.write("points", points);
			log.close();
		}

		follow = -1;
		points = 0;

		if (trickIndex < trickCount - 1) {
			notifyPlay();
		}
	}

	if (log.logging) {
		log.close();
	}
}

void HeartsCore::notifyPlay() {
	for (HeartsPlayer& player : players) {
		player.module->notifyPlay(lastPlayedIndex);
	}
}

void HeartsCore::playCard(HeartsPlayer& player, const Card& card) {
	player.trick = card;
	points += HeartsStaticData::points(card);
	player.cardsPlayed.push_back(card.code);
	deck.cardsNotPlayed.erase(card);

	if (card.suit == 3) {
		heartsBroken = true;
	}

	if (follow != -1 && card.suit != follow) {
		player.showedOut[follow] = true;
	}

	if (follow == -1 || config.oregon) {
		follow = card.suit;
	}
}

void HeartsCore::evaluateTrick() {
	leader = trickWinner(follow);
	players[leader].points += points;

	if (points > 0) {
		if (shooter == -2) {
			shooter = leader;
		}
		else if (shooter != leader) {
			shooter = -1;
		}
	}
}

void HeartsCore::score(ShootChoice shootChoice) {
	if (shootChoice == NO_SHOOT) {
		for (HeartsPlayer& player : players) {
			int points = player.points;
			if (points == 0 && config.oregon) {
				points = 10;
			}
			player.score += points;
			player.points = 0;
		}
	}
	else {
		int points[2] = { 0, 0 };
		switch (shootChoice) {
		case GO_DOWN:
			points[1] = -shootPoints;
			break;
		case OTHERS_GO_UP:
			points[0] = shootPoints;
			points[1] = 0;
			break;
		case GO_UP:
			points[1] = shootPoints;
			break;
		default:
			break;
		}
		for (HeartsPlayer& player : players) {
			player.score += points[(int)(player.index == shooter)];
		}
	}

	for (HeartsPlayer& player : players) {
		if (player.score == 100) {
			player.score = 0;
		}
	}

	if (config.maxRounds > 0 && roundNumber == config.maxRounds - 1) {
		gameOver = true;
	}

	bestScore = std::numeric_limits<int>::max();
	for (HeartsPlayer& player : players) {
		if (player.score > 100) {
			gameOver = true;
		}

		if (player.score < bestScore) {
			bestScore = player.score;
		}
	}
}

void HeartsCore::whatCanIPlay(Hand& hand, bool firstTrick, std::vector<const Card*>& canPlay) {
	std::vector<const Card*> secondPass;
	for (const Card& card : hand) {
		if (card.code == leadCode) {
			canPlay.push_back(&card);
			return;
		}

		if (
			card.suit == follow 
			|| (follow == -1 && (heartsBroken || card.suit != 3))
			) {
			canPlay.push_back(&card);
		}
		if (canPlay.empty() && (follow == -1 || !firstTrick || HeartsStaticData::points(card) == 0)) {
			secondPass.push_back(&card);
		}
	}

	if (!canPlay.empty()) {
		return;
	}
	if (!secondPass.empty()) {
		canPlay.insert(canPlay.end(), secondPass.begin(), secondPass.end());
		return;
	}
	for (const Card& card : hand) {
		canPlay.push_back(&card);
	}
}

int HeartsCore::trickWinner(int follow) {
	int ans = -1;
	int winningNum = -1;
	for (HeartsPlayer& player : players) {
		if (player.trick.suit == follow && player.trick.num > winningNum) {
			ans = player.index;
			winningNum = player.trick.num;
		}
	}
	return ans;
}