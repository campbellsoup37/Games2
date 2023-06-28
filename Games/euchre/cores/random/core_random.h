#include "euchre/core.h"

class EuchrePlayerRandom : public EuchrePlayer {
	using EuchrePlayer::EuchrePlayer;

public:
	void chooseTrump(int phase, bool stuck) override;
	void pickItUp() override;
	void play(std::vector<const Card*>& canPlay) override;

	const Card& chooseRandomCard();
};

class EuchreCoreRandom : public EuchreCore {
	using EuchreCore::EuchreCore;

public:
	std::shared_ptr<EuchrePlayer> createPlayer(int index) override;
};