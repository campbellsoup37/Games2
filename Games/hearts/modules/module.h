#pragma once

#include <vector>

class HeartsCore;
class HeartsPlayer;

class HeartsAiModule {
public:
	virtual void pass() {}
	virtual void play(std::vector<const Card*>& canPlay) {}
	virtual void shoot() {}

	virtual void notifyGameStart() {}
	virtual void notifyPass() {}
	virtual void notifyPlay(int index) {}
	virtual void notifyShoot() {}

	virtual void setCoreAndPlayer(HeartsCore* core, HeartsPlayer* player) {
		this->core = core;
		this->player = player;
	}

	HeartsCore* core;
	HeartsPlayer* player;
};