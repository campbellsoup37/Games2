#pragma once

#include <iostream>
#include <memory>
#include <random>
#include <set>
#include <unordered_set>
#include <vector>

#include "cards.h"
#include "logging.h"

class EuchreConfig {
public:
	bool stickTheDealer;
	int maxRounds;

	unsigned seed;

	int N = 4;
	int h = 5;
	int lowCard = 7;
	int winningPoints = 10;
};

using Hand = std::set<Card, CardCodeCompare>;

class EuchreDeck : public Deck {
public:
	EuchreDeck(std::mt19937& rng, int lowCard) : Deck(1, rng), lowCard(lowCard) {}

	void initialize(std::vector<int>& codes) {
		cardsNotPlayed.clear();
		for (int i = 0; i < 4; i++) {
			for (int j = lowCard; j <= 12; j++) {
				int code = 13 * i + j;
				codes.push_back(code);
				cardsNotPlayed.insert(code);
			}
		}
	}

	static int trumpAdjustedSuit(const Card& card, int trump) {
		if (card.num == 9 && (card.suit + 2) % 4 == trump) {
			return trump;
		}
		return card.suit;
	}

	static int trumpAdjustedNum(const Card& card, int trump) {
		if (card.num == 9) {
			if (card.suit == trump) {
				return 14;
			}
			else if ((card.suit + 2) % 4 == trump) {
				return 13;
			}
		}
		return card.num;
	}

	int lowCard = 7;
	Hand cardsNotPlayed;
};

class EuchreCore;

enum EuchreTrumpPhase { UP = 0, DOWN = 1, DECLARED = 2, PASSED = 3 };

class TrumpChoice {
public:
	TrumpChoice() : pass(true), suit(-1), alone(false) {};
	TrumpChoice(int suit, bool alone) : pass(suit == -1), suit(suit), alone(alone) {};
	std::string toString() {
		if (pass) {
			return "pass";
		}
		std::stringstream ss;
		ss << Card::suitString(suit);
		if (alone) {
			ss << ",alone";
		}
		return ss.str();
	}

	bool pass;
	int suit;
	bool alone;
};

class EuchrePlayer {
public:
	EuchrePlayer(EuchreCore* core, int index) : core(core), index(index) {}

	virtual void chooseTrump(int phase, bool stuck) {}
	virtual void pickItUp() {}
	virtual void play(std::vector<const Card*>& canPlay) {}

	EuchreCore* core;

	int index;
	Hand hand;
	Card trick;
	int taken;

	TrumpChoice readiedTrumpChoice;
	Card readiedDiscard;
	Card readiedPlay;

	bool showedOut[4] = {};
};

enum EuchreRoundResult { UNFINISHED = -1, EUCHRED = 0, MADE = 1, MADE_ALL = 2 };

class EuchreCore {
public:
	EuchreCore(EuchreConfig& config) : config(config), rng(config.seed), deck(rng, config.lowCard) {}
	virtual void initialize();
	virtual std::shared_ptr<EuchrePlayer> createPlayer(int index);

	// Run
	virtual void run(std::string logFilename);
	virtual void runChooseTrump();
	virtual void runOrderUp();
	virtual void runPlay();

	// Setup
	virtual void gameSetup();
	virtual void dealSetup();
	virtual void deal();
	virtual void playSetup();
	virtual void trickSetup();

	// Choose trump
	virtual void chooseTrumpSetup();
	virtual TrumpChoice& getTrumpChoice(int index);
	virtual void applyTrumpChoice(int index, TrumpChoice& choice);
	virtual void trumpChoiceApplied(int index, TrumpChoice& choice);

	// Order up
	virtual Card& getDiscard(int index);
	virtual void discard(int index, const Card& card);
	virtual void discarded(int index, const Card& card);

	// Play
	virtual Card& getCardPlay(int index);
	virtual void playCard(int index, const Card& card);
	virtual void evaluateTrick();
	virtual void score();
	virtual void cardPlayed(int index, const Card& card);
	virtual void scored();

	// Helper functions
	virtual void whatCanIPlay(Hand& hand, std::vector<const Card*>& canPlay);
	virtual int trickWinner();

	EuchreConfig config;
	Log log;

	std::mt19937 rng;
	EuchreDeck deck;
	std::vector<std::shared_ptr<EuchrePlayer>> players;
	std::vector<int> scores;

	bool gameOver;
	int roundNumber;
	Card upCard;
	EuchreTrumpPhase trumpPhase;
	int trumpIndex;
	bool dealerStuck;
	int trump;
	int declarer;
	int alone;
	bool orderedUp;
	int sittingOut;
	int trickIndex;
	int playIndex;
	EuchreRoundResult roundResult;
	int leader;
	int follow;
	int winningScore;
};
