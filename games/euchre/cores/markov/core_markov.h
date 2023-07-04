#include "euchre/core.h"
#include "markov.h"
#include "ml.h"

class EuchreCoreMarkov;

// ML

int adjustedCode(int code, int trump, int lowCard);
int unadjustedCode(int code, int trump, int lowCard);

class FeatureCard : public FeatureOneHot {
public:
	FeatureCard(SparseVector& vec, std::string name, bool allowEmpty, int lowCard, int trump, bool numOnly) 
		: FeatureOneHot(vec, name, (numOnly ? 1 : 4) * (13 - lowCard) - 1, allowEmpty ? -1 : 0), lowCard(lowCard), trump(trump) {}

	void set(const Card* card);

	void log(Log& logger) override;
	std::vector<std::string> labels() override;

	int lowCard;
	int trump;
};

class FeatureHand : public FeatureDense {
public:
	FeatureHand(SparseVector& vec, std::string name, int lowCard, int trump) : FeatureDense(vec, name, 4 * (13 - lowCard)), lowCard(lowCard), trump(trump) {}
	
	void set(const Hand& hand);
	void set(const std::vector<int>& hand, int exclude = -1);
	void add(const Card& card);
	void remove(const Card& card);

	void log(Log& logger) override;
	std::vector<std::string> labels() override;

	int lowCard;
	int trump;
};

class FeatureShowedOuts : public FeatureDense {
public:
	FeatureShowedOuts(SparseVector& vec, std::string name, int trump) : FeatureDense(vec, name, 4), trump(trump) {}

	void set(int suit, bool value);

	void log(Log& logger) override;
	std::vector<std::string> labels() override;

	int trump;
};

class TIn : public SparseVector {
public:
	class TeamFeatures {
	public:
		TeamFeatures(TIn& tIn, const EuchreCoreMarkov& core, std::string i);

		FeatureOneHot score;
	};

	TIn(const EuchreCoreMarkov& core, int trump);

	int trump;

	FeatureOneHot me;
	FeatureHand myHand;
	FeatureCard upCard;
	FeatureOneHot phase;
	FeatureOneHot turn;
	std::vector<std::unique_ptr<TeamFeatures>> teamFeatures;
};

class PIn : public SparseVector {
public:
	class TeamFeatures {
	public:
		TeamFeatures(PIn& pIn, const EuchreCoreMarkov& core, std::string i);

		FeatureOneHot taken;
		FeatureOneHot score;
	};

	class PlayerFeatures {
	public:
		PlayerFeatures(PIn& pIn, const EuchreCoreMarkov& core, std::string i);

		FeatureCard trick;
		FeatureShowedOuts showedOuts;
		FeatureHand cardsPlayed;
	};

	PIn(const EuchreCoreMarkov& core, int trump);

	int trump;

	FeatureOneHot me;
	FeatureHand myHand;
	FeatureCard upCard;
	FeatureOneHot declarer;
	FeatureOneHot alone;
	FeatureOneHot dealer;
	std::vector<std::unique_ptr<TeamFeatures>> teamFeatures;
	std::vector<std::unique_ptr<PlayerFeatures>> playerFeatures;
};

class RIn : public SparseVector {
public:
	class TeamFeatures {
	public:
		TeamFeatures(RIn& rIn, const EuchreCoreMarkov& core, std::string i);

		FeatureOneHot taken;
		FeatureOneHot score;
	};

	class PlayerFeatures {
	public:
		PlayerFeatures(RIn& rIn, const EuchreCoreMarkov& core, std::string i);

		FeatureShowedOuts showedOuts;
		FeatureHand cardsPlayed;
	};

	RIn(const EuchreCoreMarkov& core, int trump, int leader);

	int trump;
	int leader;

	FeatureOneHot me;
	FeatureHand myHand;
	FeatureCard upCard;
	FeatureOneHot declarer;
	FeatureOneHot alone;
	FeatureOneHot dealer;
	std::vector<std::unique_ptr<TeamFeatures>> teamFeatures;
	std::vector<std::unique_ptr<PlayerFeatures>> playerFeatures;
};

//class WIn : public SparseVector {
//public:
//	class TeamFeatures {
//	public:
//		TeamFeatures(WIn& wIn, const EuchreCoreMarkov& core, std::string i);
//
//		FeatureOneHot score;
//	};
//
//	WIn(const EuchreCoreMarkov& core);
//
//	std::vector<std::unique_ptr<TeamFeatures>> teamFeatures;
//};

class WIn : public SparseVector {
public:
	WIn(const EuchreCoreMarkov& core);

	FeatureOneHot scores;
};

class TNN : public NeuralNetwork {
public:
	TNN() : NeuralNetwork("tnn") {}

	std::vector<std::string> labels() override {
		return { "pass", "C", "C_alone", "D", "D_alone", "S", "S_alone", "H", "H_alone" };
	}
};

class PNN : public NeuralNetwork {
public:
	PNN(int lowCard) : NeuralNetwork("pnn"), lowCard(lowCard) {}

	std::vector<std::string> labels() override {
		std::vector<std::string> ans;
		for (int i = 0; i < 4; i++) {
			for (int j = lowCard; j <= 12; j++) {
				int code = 13 * i + j;
				ans.push_back(Card(code).toString());
			}
		}
		return ans;
	}

	int lowCard;
};

class RNN : public NeuralNetwork {
public:
	RNN() : NeuralNetwork("rnn") {}

	std::vector<std::string> labels() override {
		return { "euchred", "made", "made_all" };
	}
};

class WNN : public NeuralNetwork {
public:
	WNN(int N) : NeuralNetwork("wnn"), N(N) {}

	std::vector<std::string> labels() override {
		std::vector<std::string> ans;
		for (int i = 0; i < N / 2; i++) {
			ans.push_back("team_" + std::to_string(i));
		}
		return ans;
	}

	int N;
};

// core

class EuchreCoreMarkov : public EuchreCore {
public:
	EuchreCoreMarkov(EuchreConfig& config) : EuchreCore(config), pnn(config.lowCard), wnn(config.N) {
		int wOutMemoCapacity = 1;
		for (int i = 0; i < config.N / 2; i++) {
			wOutMemoCapacity *= config.winningPoints;
		}
		wOutMemo.resize(wOutMemoCapacity);
	}

	void initialize() override;
	std::shared_ptr<EuchrePlayer> createPlayer(int index) override;
	void dealSetup() override;
	void chooseTrumpSetup() override;
	void trumpChoiceApplied(int index, TrumpChoice& choice) override;
	void playSetup() override;
	void trickSetup() override;
	void cardPlayed(int index, const Card& card) override;
	void scored() override;

	class Undo {
	public:
		Undo(EuchreCoreMarkov& core) : core(core) {}

		virtual void undo() = 0;
		void undoAll() {
			if (next != nullptr) {
				next->undoAll();
			}
			undo();
		}

		EuchreCoreMarkov& core;
		std::shared_ptr<Undo> next;
	};

	class UnapplyTrumpChoice : public Undo {
	public:
		UnapplyTrumpChoice(EuchreCoreMarkov& core, std::shared_ptr<EuchrePlayer> owner, TrumpChoice& choice, EuchreTrumpPhase trumpPhase) : Undo(core), owner(owner), choice(choice), prevTrumpPhase(trumpPhase) {};
		void undo() override;

		std::shared_ptr<EuchrePlayer> owner;
		TrumpChoice choice;
		EuchreTrumpPhase prevTrumpPhase;
	};

	class UnplayCard : public Undo {
	public:
		UnplayCard(EuchreCoreMarkov& core, std::shared_ptr<EuchrePlayer> owner, std::shared_ptr<EuchrePlayer> player, const Card& card);
		void undo() override;

		std::shared_ptr<EuchrePlayer> owner;
		std::shared_ptr<EuchrePlayer> player;
		const Card& card;
		int prevFollow;
		bool prevShowedOut;
		int prevPlayIndex;
	};

	class UnevaluateTrick : public Undo {
	public:
		UnevaluateTrick(EuchreCoreMarkov& core, std::shared_ptr<EuchrePlayer> owner);
		void undo() override;

		std::shared_ptr<EuchrePlayer> owner;
		int prevLeader;
	};

	class Unscore : public Undo {
	public:
		Unscore(EuchreCoreMarkov& core) : Undo(core), prevScores(core.scores) {}
		void undo() override;

		std::vector<int> prevScores;
	};

	std::shared_ptr<Undo> applyTrumpChoiceHypo(std::shared_ptr<EuchrePlayer> owner, int index, TrumpChoice& choice);
	std::shared_ptr<Undo> playCardHypo(std::shared_ptr<EuchrePlayer> owner, std::shared_ptr<EuchrePlayer> player, const Card& card, int lastIndex);
	std::shared_ptr<Undo> scoreHypo(EuchreRoundResult roundResult);

	void applyTrumpChoiceForPlayerTIn(std::shared_ptr<EuchrePlayer> owner, int index, TrumpChoice& choice);
	void playCardForPlayerPIn(std::shared_ptr<EuchrePlayer> owner, std::shared_ptr<EuchrePlayer> player, const Card& card, int prevLeader);
	void evaluateTrickForPlayerRIn(std::shared_ptr<EuchrePlayer> owner);

	void logDebugDetails();

	virtual std::shared_ptr<std::vector<double>> tModel(const SparseVector& vec) { return tnn(vec); }

	virtual std::shared_ptr<std::vector<double>> pModel(const SparseVector& vec) { return pnn(vec); }

	virtual std::shared_ptr<std::vector<double>> rModel(const SparseVector& vec) { return rnn(vec); }

	virtual std::shared_ptr<std::vector<double>> wModel(const SparseVector& vec) { return wnn(vec); }
	void initializeWIn();
	std::shared_ptr<std::vector<double>> getWOut();

	void clearData();

	virtual void ipdb() {};

	TNN tnn;
	std::shared_ptr<SparseVector> emptyTIn;
	std::vector<std::shared_ptr<TIn>> tIns;
	std::vector<InOutPair> tData;

	PNN pnn;
	std::shared_ptr<SparseVector> emptyPIn;
	std::vector<std::shared_ptr<PIn>> pIns;
	std::vector<InOutPair> pData;

	RNN rnn;
	std::shared_ptr<SparseVector> emptyRIn;
	std::vector<std::vector<std::shared_ptr<RIn>>> trumpRIns;
	std::vector<std::vector<std::shared_ptr<RIn>>> playRIns;
	std::vector<std::shared_ptr<SparseVector>> rInCache;
	std::vector<InOutPair> rData;

	WNN wnn;
	std::shared_ptr<SparseVector> emptyWIn;
	std::shared_ptr<WIn> wIn;
	std::vector<std::shared_ptr<std::vector<double>>> wOutMemo;
	std::vector<std::shared_ptr<SparseVector>> wInCache;
	std::vector<InOutPair> wData;
};

class EuchrePlayerMarkov : public EuchrePlayer {
public:
	EuchrePlayerMarkov(EuchreCore* core, int index) : EuchrePlayer(core, index), shouldLog(false), greed(1.0) {}

	void chooseTrump(int phase, bool stuck) override;
	void pickItUp() override;
	void play(std::vector<const Card*>& canPlay) override;

	double roll() { return greed == 1.0 ? 1.0 : (double)core->rng() / core->rng.max(); }

	Log* log() {
		if (shouldLog) {
			return &core->log;
		}
		return nullptr;
	}
	bool didIWin() {
		return core->scores[index % (core->config.N / 2)] == core->winningScore;
	}

	const Card& chooseRandomCard();

	bool shouldLog;
	double greed;
	std::vector<int> cardsPlayed;
};

class TrumpDecision : public Diff {
public:
	TrumpDecision(EuchrePlayerMarkov& player) : Diff(0, player.log()), player(player) {}

	std::vector<std::shared_ptr<Diff>> children() override;

	std::string cls() override { return "TrumpDecision"; }
	std::string name() override { return "choices"; }

	EuchrePlayerMarkov& player;
};

class TrumpDiff : public Diff {
public:
	TrumpDiff(EuchrePlayerMarkov& player, int index, int suit, bool alone, double p) : Diff(p, player.log()), player(player), index(index), trumpChoice(suit, alone) {}

	std::vector<std::shared_ptr<Diff>> children() override;
	void apply() override;
	void undo() override;

	int weight() override;

	std::string cls() override { return "TrumpDiff"; }
	std::string name() override;

	void logExtraDetails() override;

	EuchreCoreMarkov* core() {
		return dynamic_cast<EuchreCoreMarkov*>(player.core);
	}

	EuchrePlayerMarkov& player;
	int index;
	TrumpChoice trumpChoice;

	std::shared_ptr<EuchreCoreMarkov::Undo> undoRoot;
};

class DiscardDecision : public Diff {
public:
	DiscardDecision(EuchrePlayerMarkov& player) : Diff(0, player.log()), player(player) {}

	std::vector<std::shared_ptr<Diff>> children() override;

	std::string cls() override { return "DiscardDecision"; }
	std::string name() override { return "choices"; }

	EuchrePlayerMarkov& player;
};

class DiscardDiff : public Diff {
public:
	DiscardDiff(EuchrePlayerMarkov& player, const Card& card) : Diff(1.0, player.log()), player(player), card(card) {}

	std::vector<std::shared_ptr<Diff>> children() override;
	void apply() override;
	void undo() override;

	std::string cls() override { return "DiscardDiff"; }
	std::string name() override;

	void logExtraDetails() override;

	EuchreCoreMarkov* core() {
		return dynamic_cast<EuchreCoreMarkov*>(player.core);
	}

	EuchrePlayerMarkov& player;
	Card card;
};

class PlayDecision : public Diff {
public:
	PlayDecision(EuchrePlayerMarkov& player, std::vector<const Card*>& canPlay) : Diff(0, player.log()), player(player), canPlay(canPlay) {}

	std::vector<std::shared_ptr<Diff>> children() override;

	std::string cls() override { return "PlayDecision"; }
	std::string name() override { return "choices"; }

	EuchrePlayerMarkov& player;
	std::vector<const Card*>& canPlay;
};

class PlayDiff : public Diff {
public:
	// Important to copy card here because we may want to erase it from the set that owns it.
	PlayDiff(EuchrePlayerMarkov& player, int index, const Card& card, int lastIndex, double p) 
		: Diff(p, player.log()), player(player), index(index), card(card), lastIndex(lastIndex), undoRoot(nullptr) {}

	std::vector<std::shared_ptr<Diff>> children() override;
	void apply() override;
	void undo() override;

	std::string cls() override { return "PlayDiff"; }
	std::string name() override;

	void logExtraDetails() override;

	EuchreCoreMarkov* core() {
		return dynamic_cast<EuchreCoreMarkov*>(player.core);
	}

	EuchrePlayerMarkov& player;
	int index;
	Card card;
	int lastIndex;

	std::shared_ptr<EuchreCoreMarkov::Undo> undoRoot;
};

class RoundResultDiff : public Diff {
public:
	RoundResultDiff(EuchrePlayerMarkov& player, EuchreRoundResult roundResult, double p)
		: Diff(p, player.log()), player(player), roundResult(roundResult) {}

	std::vector<std::shared_ptr<Diff>> children() override;
	void apply() override;
	void undo() override;

	std::string cls() override { return "RoundResultDiff"; }
	std::string name() override;

	void logExtraDetails() override;

	EuchreCoreMarkov* core() {
		return dynamic_cast<EuchreCoreMarkov*>(player.core);
	}

	EuchrePlayerMarkov& player;
	EuchreRoundResult roundResult;

	std::shared_ptr<EuchreCoreMarkov::Undo> undoRoot;
};

class WinDiff : public TerminalDiff {
public:
	WinDiff(EuchrePlayerMarkov& player, double p) : TerminalDiff(p, 1.0, player.log()) {}

	std::string cls() override { return "WinDiff"; }
	std::string name() override { return "win"; }
};