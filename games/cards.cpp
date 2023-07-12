#include <sstream>

#include "cards.h"

std::string nums[14] = { "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", " " };
std::string suits[4] = { "C", "D", "S", "H" };

// Card
Card::Card(int code) {
	this->code = code;
	num = code % 13;
	suit = code / 13;
}

std::string Card::toString() const {
	return nums[num] + suits[suit];
}

std::string Card::suitString(int suit) {
	return suits[suit];
}

std::string Card::numString(int num) {
	return nums[num];
}

// Deck
void Deck::initialize(std::vector<int>& codes) {
	// Standard deck:
	for (int i = 0; i < 52; i++) {
		for (int j = 0; j < D; j++) {
			codes.push_back(i);
		}
	}
}

void Deck::shuffle() {
	std::vector<int> codes;
	initialize(codes);

	// Shuffle in place
	for (int i = (int)codes.size() - 1; i > 0; i--) {
		int j = rng() % (i + 1);
		int temp = codes[i];
		codes[i] = codes[j];
		codes[j] = temp;
	}

	// Remove existing cards
	while (!cards.empty()) {
		cards.pop();
	}

	// Put in queue
	for (int code : codes) {
		cards.emplace(code);
	}
}

bool Deck::empty() {
	return cards.empty();
}

Card* Deck::draw() {
	if (empty()) {
		return nullptr;
	}
	Card* ans = &cards.front();
	cards.pop();
	return ans;
}

std::string Deck::toString() {
	std::stringstream ss;
	for (Card* c = draw(); c != nullptr; c = draw()) {
		ss << c->toString() << " ";
	}
	return ss.str();
}