#pragma once

#include <functional>
#include <pybind11/pybind11.h>
#include <sstream>
#include <string>

#include "markov.h"
#include "ml.h"
#include "hearts/modules/module.h"

// ML

class FeatureCard : public FeatureOneHot {
public:
	FeatureCard(SparseVector& vec, std::string name, bool allowEmpty) : FeatureOneHot(vec, name, 51, allowEmpty ? -1 : 0) {}

	void set(const Card* card) { FeatureOneHot::set(card == nullptr ? -1 : card->code); }

	void log(Log& logger) override;
};

class FeatureHand : public FeatureDense {
public:
	FeatureHand(SparseVector& vec, std::string name) : FeatureDense(vec, name, 52) {}

	void set(const Hand& hand);
	void set(const std::vector<int>& hand, int exclude = -1);
	void add(const Card& card) { FeatureDense::set(card.code, 1.0); }
	void remove(const Card& card) { FeatureDense::set(card.code, 0.0); }

	void log(Log& logger) override;
};

class PIn : public SparseVector {
public:
	class PlayerFeatures {
	public:
		PlayerFeatures(PIn& pIn, const HeartsCore& core, int negativeScoreTolerance, std::string i) :
			trick(pIn, i + "_trick", true),
			showedOuts(pIn, i + "_showed_outs", 4),
			cardsPlayed(pIn, i + "_cards_played"),
			points(pIn, i + "_points", 26),
			score(pIn, i + "_score", 99, negativeScoreTolerance - 1),
			passed(pIn, i + "_passed", 1)
		{}

		FeatureCard trick;
		FeatureDense showedOuts;
		FeatureHand cardsPlayed;
		FeatureOneHot points;
		FeatureOneHot score;
		FeatureOneHot passed;
	};

	PIn(const HeartsCore& core, int negativeScoreTolerance) :
		myHand(*this, "my_hand"),
		passOffset(*this, "pass_offset", core.config.N - 1),
		myPass(*this, "my_pass"),
		passedToMe(*this, "passed_to_me"),
		turn(*this, "turn", core.config.N - 1, 1),
		me(*this, "me", core.config.N - 2)
	{
		for (int i = 0; i < core.config.N; i++) {
			playerFeatures.push_back(std::make_unique<PlayerFeatures>(*this, core, negativeScoreTolerance, std::to_string(i)));
		}
	}

	FeatureHand myHand;
	FeatureOneHot passOffset;
	FeatureHand myPass;
	FeatureHand passedToMe;
	FeatureOneHot turn;
	FeatureOneHot me;
	std::vector<std::unique_ptr<PlayerFeatures>> playerFeatures;
};

class QIn : public SparseVector {
public:
	class PlayerFeatures {
	public:
		PlayerFeatures(QIn& qIn, const HeartsCore& core, int negativeScoreTolerance, std::string i) :
			showedOuts(qIn, i + "_showed_outs", 4),
			cardsPlayed(qIn, i + "_cards_played"),
			points(qIn, i + "_points", 26),
			score(qIn, i + "_score", 99, negativeScoreTolerance - 1),
			passed(qIn, i + "_passed", 1)
		{}

		FeatureDense showedOuts;
		FeatureHand cardsPlayed;
		FeatureOneHot points;
		FeatureOneHot score;
		FeatureOneHot passed;
	};

	QIn(const HeartsCore& core, int negativeScoreTolerance) :
		state(*this, "state", 2),
		myHand(*this, "my_hand"),
		passOffset(*this, "pass_offset", core.config.N - 1),
		myPass(*this, "my_pass"),
		passedToMe(*this, "passed_to_me"),
		leader(*this, "leader", core.config.N - 1, -1)
	{
		for (int i = 0; i < core.config.N; i++) {
			playerFeatures.push_back(std::make_unique<PlayerFeatures>(*this, core, negativeScoreTolerance, std::to_string(i)));
		}
	}

	FeatureOneHot state; // playing / end of round / passing
	FeatureHand myHand;
	FeatureOneHot passOffset;
	FeatureHand myPass;
	FeatureHand passedToMe;
	FeatureOneHot leader; // -1 = don't know
	std::vector<std::unique_ptr<PlayerFeatures>> playerFeatures;
};

// Module

class PlayDecision;

class HeartsAiModuleMarkov : public HeartsAiModule {
public:
	HeartsAiModuleMarkov(int negativeScoreTolerance, double greed, bool log) : areInsStale(true), greed(greed), negativeScoreTolerance(negativeScoreTolerance), log(log) {}

	virtual void setCoreAndPlayer(HeartsCore* core, HeartsPlayer* player) {
		HeartsAiModule::setCoreAndPlayer(core, player);
	}

	void pass() override;
	void play(std::vector<const Card*>& canPlay) override;
	void shoot() override;

	void notifyGameStart() override;
	void notifyPass() override;
	void notifyPlay(int index) override;
	void notifyShoot() override {}

	bool isMyScoreTheBest() { return player->score == core->bestScore; }

	void loadPIn();
	int getPInSize();
	virtual const std::vector<double>& pModel(const SparseVector& vec) = 0;

	void loadQIn();
	int getQInSize();
	virtual const std::vector<double>& qModel(const SparseVector& vec) = 0;

	Log* getLog() {
		if (log) {
			return &core->log;
		}
		return nullptr;
	};

	std::shared_ptr<PIn> pIn;
	std::shared_ptr<QIn> qIn;
	bool areInsStale;

	std::vector<InOutPair> pPairs;
	std::vector<InOutPair> qPairs;

	int negativeScoreTolerance;
	double greed;

	bool log;
};

class PyHeartsAiModuleMarkov : public HeartsAiModuleMarkov {
public:
	using HeartsAiModuleMarkov::HeartsAiModuleMarkov;

	virtual const std::vector<double>& pModel(const SparseVector& vec) {
		PYBIND11_OVERRIDE_PURE(const std::vector<double>&, HeartsAiModuleMarkov, pModel, vec);
	}

	virtual const std::vector<double>& qModel(const SparseVector& vec) {
		PYBIND11_OVERRIDE_PURE(const std::vector<double>&, HeartsAiModuleMarkov, qModel, vec);
	}
};

// Diffs

class PassDecision : public Diff {
public:
	PassDecision(HeartsAiModuleMarkov& module) : Diff(0, module.getLog()), module(module) {}

	std::vector<std::shared_ptr<Diff>> children() override;

	std::string cls() override { return "PassDecision"; }
	std::string name() override { return "choices"; }

	HeartsAiModuleMarkov& module;
};

class PassDiff : public Diff {
public:
	PassDiff(HeartsAiModuleMarkov& module, const std::vector<int>& cards) : Diff(1.0, module.getLog()), module(module), cards(cards) {}

	std::vector<std::shared_ptr<Diff>> children() override;
	void apply() override;
	void undo() override;

	void evolveQIn();
	void devolveQIn(int leaderMemo);

	std::string cls() override { return "PassDiff"; }
	std::string name() override;

	void logExtraDetails() override;

	HeartsAiModuleMarkov& module;

	std::vector<int> cards;

	int prevLeader;
};

class PlayDecision : public Diff {
public:
	PlayDecision(HeartsAiModuleMarkov& module, std::vector<const Card*>& canPlay) : Diff(0, module.getLog()), module(module), canPlay(canPlay) {}

	std::vector<std::shared_ptr<Diff>> children() override;

	std::string cls() override { return "PlayDecision"; }
	std::string name() override { return "choices"; }

	HeartsAiModuleMarkov& module;
	std::vector<const Card*>& canPlay;
};

class PlayDiff : public Diff {
public:
	// Important to copy card here because we may want to erase it from the set that owns it.
	PlayDiff(HeartsAiModuleMarkov& module, int index, const Card& card, int lastIndex, double p) : Diff(p, module.getLog()), module(module), index(index), card(card), lastIndex(lastIndex) {}

	std::vector<std::shared_ptr<Diff>> children() override;
	void apply() override;
	void undo() override;

	void evolvePIn();
	void evolveQIn();
	void devolvePIn();
	void devolveQIn(int leaderMemo);

	std::string cls() override { return "PlayDiff"; }
	std::string name() override;

	void logExtraDetails() override;

	HeartsAiModuleMarkov& module;
	int index;
	Card card;
	int lastIndex;

	class Undo {
	public:
		Undo(HeartsCore& core) : core(core) {}

		virtual void undo() = 0;
		void undoAll() {
			if (next != nullptr) {
				next->undoAll();
			}
			undo();
		}

		HeartsCore& core;
		std::unique_ptr<Undo> next;
	};

	class UnplayCard : public Undo {
	public:
		UnplayCard(HeartsCore& core, HeartsPlayer& player, const Card& card) : Undo(core), player(player), card(card), prevHeartsBroken(core.heartsBroken), prevShowedOut(core.follow == -1 ? false : player.showedOut[core.follow]) {}
		void undo() override;

		HeartsPlayer& player;
		const Card& card;
		bool prevHeartsBroken;
		bool prevShowedOut;
	};

	class UnevaluateTrick : public Undo {
	public:
		UnevaluateTrick(HeartsCore& core) : Undo(core), prevLeader(core.leader), prevShooter(core.shooter) {};
		void undo() override;

		int prevLeader;
		int prevShooter;
	};

	class Unscore : public Undo {
	public:
		Unscore(HeartsCore& core);
		void undo() override;

		std::vector<int> prevPoints;
		std::vector<int> prevScores;
	};

	std::unique_ptr<Undo> undoData;
};

class WinDiff : public TerminalDiff {
public:
	WinDiff(HeartsAiModuleMarkov& module, double p) : TerminalDiff(p, 1.0, module.getLog()) {}

	std::string cls() override { return "WinDiff"; }
	std::string name() override { return "win"; }
};