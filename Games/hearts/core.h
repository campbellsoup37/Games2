#pragma once

#include <random>
#include <set>
#include <unordered_set>
#include <vector>

#include "cards.h"
#include "logging.h"

class HeartsConfig {
public:
	int N;
	bool oregon;
	int maxRounds;

	unsigned seed;
};

class HeartsStaticData {
public:
	static std::unordered_set<int> removedCodes(int N) {
		int suitRemovalPriority[4] = { 0, 1, 2, 3 };
		std::unordered_set<int> ans;
		for (int i = 0; i < 52 % N; i++) {
			int num = i / 4;
			int suit = suitRemovalPriority[i % 4];
			ans.insert(num + 13 * suit);
		}
		return ans;
	}

	static int passCount(int N) {
		if (N < 8) {
			int passCounts[8] = { 0, 0, 0, 4, 3, 2, 2, 2 };
			return passCounts[N];
		}
		else {
			return 1;
		}
	}

	static int passOffset(int N, int roundNumber) {
		int i = (roundNumber + 1) % N;
		int signedAns = (i & 1 ? 1 : -1) * ((i + 1) / 2);
		return (signedAns + N) % N;
	}

	static int leadCode(int N) {
		// 2C or 3C
		return 52 % N == 0 ? 0 : 1;
	}

	static int points(const Card& card) {
		if (card.code == 36) {
			return 13;
		}
		else if (card.suit == 3) {
			return 1;
		}
		else {
			return 0;
		}
	}

	static int shootPoints(int N) {
		return 26 - (52 % N) / 4;
	}
};

using Hand = std::set<Card, CardCodeCompare>;

class HeartsDeck : public Deck {
public:
	HeartsDeck(int N, std::mt19937& rng) : Deck(1, rng) {
		removedCodes = HeartsStaticData::removedCodes(N);
		for (int i = 0; i < 52; i++) {
			if (removedCodes.count(i) == 0) {
				codeList.push_back(i);
			}
		}
	}

	void initialize(std::vector<int>& codes) {
		codes.insert(codes.end(), codeList.begin(), codeList.end());
		cardsNotPlayed.clear();
		cardsNotPlayed.insert(codeList.begin(), codeList.end());
	}

	std::unordered_set<int> removedCodes;
	std::vector<int> codeList;
	Hand cardsNotPlayed;
};

class HeartsCore;
class HeartsAiModule;

enum ShootChoice { NO_SHOOT = 0, GO_DOWN = 1, OTHERS_GO_UP = 2, GO_UP = 3 };

class HeartsPlayer {
public:
	HeartsPlayer(HeartsCore& core, int index) : core(core), index(index) {}

	void setModule(HeartsAiModule* module);

	bool isPassing() { return readiedPass.size() > 0; }

	HeartsCore& core;
	HeartsAiModule* module;

	int index;
	Hand hand;
	Card trick;
	int points = 0;
	int score = 0;

	std::vector<Card> readiedPass;
	Card readiedPlay;
	ShootChoice readiedShoot = ShootChoice::GO_DOWN;

	std::vector<int> cardsPassed;
	std::vector<int> cardsReceived;

	std::vector<int> cardsPlayed;
	bool showedOut[4] = {};
};

enum HeartsCoreState { PASSING = 0, PLAYING = 1 };

class HeartsCore {
public:
	HeartsCore(HeartsConfig& config);

	void setModule(int index, HeartsAiModule* module);
	void run(std::string logFilename);

	void deal();
	void pass();
	void play();

	void notifyPlay();

	void playCard(HeartsPlayer& player, const Card& card);
	void evaluateTrick();
	void score(ShootChoice shootChoice);

	void whatCanIPlay(Hand& hand, bool firstTrick, std::vector<const Card*>& canPlay);
	int trickWinner(int follow);

	HeartsConfig config;
	Log log;

	std::mt19937 rng;
	HeartsDeck deck;
	std::vector<HeartsPlayer> players;

	// Constant
	int passSize;
	int leadCode;
	int shootPoints;

	// Variable
	HeartsCoreState state;
	int passOffset;
	bool gameOver;
	int bestScore;
	int roundNumber;
	int trickCount;
	int trickIndex;
	int leader;
	int lastPlayedIndex;
	int shooter;
	bool heartsBroken;
	int follow;
	int points;
};