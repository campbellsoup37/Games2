#pragma once

#include <queue>
#include <random>
#include <vector>

class Card {
public:
	Card(int code);

	Card() : Card(0) {}

	std::string toString() const;
	static std::string suitString(int suit);

	int num = 0;
	int suit = 0;
	int code = 0;
};

struct CardCodeCompare {
	bool operator() (const Card& c1, const Card& c2) const {
		return c1.code < c2.code;
	}
};

class Deck {
public:
	Deck(int D, std::mt19937& rng) : D(D), rng(rng) {}

	virtual void initialize(std::vector<int>& codes);

	void shuffle();

	bool empty();

	Card* draw();

	std::string toString();

	int D;
	std::mt19937& rng;

	std::queue<Card> cards;
};