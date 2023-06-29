#include "hearts/modules/module.h"

class HeartsAiModuleRandom : public HeartsAiModule {
public:
	void pass() override;
	void play(std::vector<const Card*>& canPlay) override;
	void shoot() override;

	const Card& chooseRandomCard();
};