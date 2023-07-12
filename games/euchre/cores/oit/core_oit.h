#include <unordered_map>

#include "euchre/core.h"
#include "markov.h"
#include "ml.h"

class EuchreCoreOIT;
class EuchrePlayerOIT;

// ML

class OITFeatureShowedOuts : public FeatureDense {
public:
	OITFeatureShowedOuts(SparseVector& vec, std::string name, int trump) : FeatureDense(vec, name, 4), trump(trump) {}

	void set(int suit, bool value);

	void log(Log& logger) override;
	std::vector<std::string> labels() override;

	int trump;
};

class OITFeatureCard : public FeatureOneHot {
public:
	OITFeatureCard(SparseVector& vec, std::string name, int lowCard)
		: FeatureOneHot(vec, name, 12, lowCard), lowCard(lowCard) {}

	void set(const Card* card);

	void log(Log& logger) override;
	std::vector<std::string> labels() override;

	int lowCard;
};

class OITFeatureUpCardStatus : public FeatureOneHot {
public:
	OITFeatureUpCardStatus(SparseVector& vec, std::string name, int N) : FeatureOneHot(vec, name, N, -2), N(N) {}

	std::vector<std::string> labels() override;

	int N;
};

class OITOIn : public SparseVector {
public:
	class TeamFeatures {
	public:
		TeamFeatures(OITOIn& oIn, const EuchreCoreOIT& core, std::string i);

		FeatureOneHot score;
	};

	class PlayerFeatures {
	public:
		PlayerFeatures(OITOIn& oIn, const EuchreCoreOIT& core, std::string i);

		OITFeatureShowedOuts showedOuts;
		FeatureOneHot taken;
	};

	OITOIn(const EuchreCoreOIT& core, int trump, int indexOffset);

	int trump;
	int indexOffset;

	FeatureOneHot handSize;
	FeatureOneHot adjustedNum;
	FeatureOneHot adjustedSuit;
	OITFeatureCard upCard;
	OITFeatureUpCardStatus upCardStatus;
	FeatureOneHot declarer;
	FeatureOneHot alone;
	FeatureOneHot leader;
	std::vector<std::unique_ptr<FeatureOneHot>> unseens;
	std::vector<std::unique_ptr<TeamFeatures>> teamFeatures;
	std::vector<std::unique_ptr<PlayerFeatures>> playerFeatures;
};

class OITIIn : public SparseVector {
public:
	class TeamFeatures {
	public:
		TeamFeatures(OITIIn& iIn, const EuchreCoreOIT& core, std::string i);

		FeatureOneHot score;
	};

	class PlayerFeatures {
	public:
		PlayerFeatures(OITIIn& iIn, const EuchreCoreOIT& core, std::string i);

		OITFeatureShowedOuts showedOuts;
		FeatureOneHot taken;
		FeatureOneHot playedStatus;
	};

	OITIIn(const EuchreCoreOIT& core, int trump, int indexOffset);

	int trump;
	int indexOffset;

	FeatureOneHot handSize;
	OITFeatureCard upCard;
	OITFeatureUpCardStatus upCardStatus;
	FeatureOneHot declarer;
	FeatureOneHot alone;
	FeatureOneHot leader;
	FeatureOneHot follow;
	FeatureOneHot winnerAdjustedNum;
	FeatureOneHot winnerIsTrump;
	std::vector<std::unique_ptr<FeatureOneHot>> unseens;
	std::vector<std::unique_ptr<TeamFeatures>> teamFeatures;
	std::vector<std::unique_ptr<PlayerFeatures>> playerFeatures;
};

class OITTIn : public SparseVector {
public:
	class TeamFeatures {
	public:
		TeamFeatures(OITTIn& tIn, const EuchreCoreOIT& core, std::string i);

		FeatureOneHot score;
	};

	class PlayerFeatures {
	public:
		PlayerFeatures(OITTIn& tIn, const EuchreCoreOIT& core, std::string i);

		OITFeatureShowedOuts showedOuts;
		FeatureOneHot taken;
	};

	OITTIn(const EuchreCoreOIT& core, int trump, int indexOffset);

	int trump;
	int indexOffset;

	FeatureOneHot handSize;
	OITFeatureCard upCard;
	OITFeatureUpCardStatus upCardStatus;
	FeatureOneHot declarer;
	FeatureOneHot alone;
	FeatureOneHot leader;
	std::vector<std::unique_ptr<FeatureOneHot>> unseens;
	std::vector<std::unique_ptr<TeamFeatures>> teamFeatures;
	std::vector<std::unique_ptr<PlayerFeatures>> playerFeatures;
};

class OITWIn : public SparseVector {
public:
	OITWIn(const EuchreCoreOIT& core);

	FeatureOneHot scores;
};

class OITONN : public NeuralNetwork {
public:
	OITONN() : NeuralNetwork("onn") {}

	std::vector<std::string> labels() override {
		return { "strength" };
	}
};

class OITINN : public NeuralNetwork {
public:
	OITINN(int N) : NeuralNetwork("inn"), N(N) {}

	std::vector<std::string> labels() override {
		std::vector<std::string> ans;
		for (int i = 0; i < N; i++) {
			ans.push_back(std::to_string(i));
		}
		return ans;
	}

	int N;
};

class OITTNN : public NeuralNetwork {
public:
	OITTNN(int h) : NeuralNetwork("tnn"), h(h) {}

	std::vector<std::string> labels() override {
		std::vector<std::string> ans;
		for (int i = 0; i <= h; i++) {
			ans.push_back(std::to_string(i));
		}
		return ans;
	}

	int h;
};

class OITWNN : public NeuralNetwork {
public:
	OITWNN(int N) : NeuralNetwork("wnn"), N(N) {}

	std::vector<std::string> labels() override {
		std::vector<std::string> ans;
		for (int i = 0; i < N / 2; i++) {
			ans.push_back(std::to_string(i));
		}
		return ans;
	}

	int N;
};

// core

class EuchreCoreOIT : public EuchreCore {
public:
	EuchreCoreOIT(EuchreConfig& config) : EuchreCore(config), inn(config.N), tnn(config.h), wnn(config.N) {
		int wOutMemoCapacity = 1;
		for (int i = 0; i < config.N / 2; i++) {
			wOutMemoCapacity *= config.winningPoints;
		}
		wOutMemo.resize(wOutMemoCapacity);
	}

	void initialize() override;
	std::shared_ptr<EuchrePlayer> createPlayer(int index) override;
	void dealSetup() override;
	void trumpChoiceApplied(int index, TrumpChoice& choice) override;
	void playSetup() override;
	void cardPlayed(int index, const Card& card) override;
	void scored() override;

	class Undo {
	public:
		Undo(EuchreCoreOIT& core) : core(core) {}

		virtual void undo() = 0;
		void undoAll() {
			if (next != nullptr) {
				next->undoAll();
			}
			undo();
		}

		EuchreCoreOIT& core;
		std::shared_ptr<Undo> next;
	};

	class UnapplyTrumpChoice : public Undo {
	public:
		UnapplyTrumpChoice(EuchreCoreOIT& core, EuchrePlayerOIT& owner, TrumpChoice& choice, EuchreTrumpPhase trumpPhase) : Undo(core), owner(owner), choice(choice), prevTrumpPhase(trumpPhase) {};
		void undo() override;

		EuchrePlayerOIT& owner;
		TrumpChoice choice;
		EuchreTrumpPhase prevTrumpPhase;
	};

	class UnplayCard : public Undo {
	public:
		UnplayCard(EuchreCoreOIT& core, EuchrePlayerOIT& owner, const Card& card);
		void undo() override;

		EuchrePlayerOIT& owner;
		const Card& card;
		int prevFollow;
		bool prevShowedOut;
		int prevPlayIndex;
		int prevTrickWinner;
	};

	class UnevaluateTrick : public Undo {
	public:
		UnevaluateTrick(EuchreCoreOIT& core, EuchrePlayerOIT& owner);
		void undo() override;

		EuchrePlayerOIT& owner;
		int prevLeader;
		int prevPlayIndex;
	};

	class UnevaluateRound : public Undo {
	public:
		UnevaluateRound(EuchreCoreOIT& core);
		void undo() override;

		int prevTrickIndex;
		int prevDeclarerTaken;
	};

	class Unscore : public Undo {
	public:
		Unscore(EuchreCoreOIT& core) : Undo(core), prevScores(core.scores) {}
		void undo() override;

		std::vector<int> prevScores;
	};

	std::shared_ptr<Undo> applyTrumpChoiceHypo(EuchrePlayerOIT& owner, TrumpChoice& choice);
	std::shared_ptr<Undo> playCardHypo(EuchrePlayerOIT& owner, const Card& card);
	std::shared_ptr<Undo> evaluateTrickHypo(EuchrePlayerOIT& owner, int winner);
	std::shared_ptr<Undo> evaluateRoundHypo(EuchrePlayerOIT& owner, int taken);

	void logDebugDetails();

	int getUpCardStatus() {
		if (trumpPhase == EuchreTrumpPhase::DOWN) {
			return -2;
		}
		if (deck->cardsNotPlayed.count(upCard) == 0) {
			return -1;
		}
		return roundNumber % config.N;
	}

	virtual std::shared_ptr<std::vector<double>> oModel(const SparseVector& vec) { return onn(vec); }
	void calculatePTQ(int index, bool alone, Log* log);
	std::shared_ptr<OITOIn> initializeOIn(int index);

	virtual std::shared_ptr<std::vector<double>> iModel(const SparseVector& vec) { return inn(vec); }
	std::shared_ptr<OITIIn> initializeIIn(int index);

	virtual std::shared_ptr<std::vector<double>> tModel(const SparseVector& vec) { return tnn(vec); }
	std::shared_ptr<OITTIn> initializeTIn(int index);

	virtual std::shared_ptr<std::vector<double>> wModel(const SparseVector& vec) { return wnn(vec); }
	void initializeWIn();
	std::shared_ptr<std::vector<double>> getWOut();

	void clearData();

	virtual void ipdb() {};

	OITONN onn;
	std::shared_ptr<SparseVector> emptyOIn;
	std::vector<double> p;
	std::vector<double> q;
	std::unordered_map<int, std::vector<std::shared_ptr<SparseVector>>> oInCache;
	std::vector<InOutPair> oData;

	OITINN inn;
	std::shared_ptr<SparseVector> emptyIIn;
	std::shared_ptr<OITIIn> iIn;
	std::vector<std::pair<int, std::shared_ptr<SparseVector>>> iInCache;
	std::vector<InOutPair> iData;

	OITTNN tnn;
	std::shared_ptr<SparseVector> emptyTIn;
	std::vector<double> t;
	std::vector<std::pair<int, std::shared_ptr<SparseVector>>> tInCache;
	std::vector<InOutPair> tData;

	OITWNN wnn;
	std::shared_ptr<SparseVector> emptyWIn;
	std::shared_ptr<OITWIn> wIn;
	std::vector<std::shared_ptr<std::vector<double>>> wOutMemo;
	std::vector<std::shared_ptr<SparseVector>> wInCache;
	std::vector<InOutPair> wData;
};

class EuchrePlayerOIT : public EuchrePlayer {
public:
	EuchrePlayerOIT(EuchreCore* core, int index) : EuchrePlayer(core, index), greed(1.0) {
		for (int i = 0; i < 4; i++) {
			seenAdjustedNums.emplace_back(15 - core->deck->lowCard, 0);
		}
	}

	void chooseTrump(int phase, bool stuck) override;
	void pickItUp() override;
	void play(std::vector<const Card*>& canPlay) override;

	double roll() { return greed == 1.0 ? 1.0 : (double)core->rng() / core->rng.max(); }

	bool didIWin() {
		return core->scores[index % (core->config.N / 2)] == core->winningScore;
	}

	void resetSeenAdjustedNums() {
		for (int i = 0; i < 4; i++) {
			for (int j = 0; j < 14 - core->deck->lowCard; j++) {
				seenAdjustedNums[i][j + 1] = j;
			}
		}
		seenAdjustedNums[0][0] = 0;
		seenAdjustedNums[1][0] = 1;
		seenAdjustedNums[1][1] = -100; // unused, fill with obviously meaningless number
		seenAdjustedNums[2][0] = 1;
		seenAdjustedNums[2][1] = -100; // unused, fill with obviously meaningless number
		seenAdjustedNums[3][0] = 1;
		seenAdjustedNums[3][1] = -100; // unused, fill with obviously meaningless number
		for (int j = 0; j < 11 - core->deck->lowCard; j++) {
			seenAdjustedNums[2][j]++;
		}
	}

	std::pair<int, int> getSeenAdjustedNumsIndices(const Card& card) {
		int i = (EuchreDeck::trumpAdjustedSuit(card, core->trump) + 4 - core->trump) % 4;
		int j = EuchreDeck::trumpAdjustedNum(card, core->trump) - 5;
		if (i == 0) {
			j--;
			if (card.num >= 9) {
				j--;
			}
		}
		return { i, j };
	}

	void shiftSeenAdjustedNums(const Card& card) {
		const std::pair<int, int>& ij = getSeenAdjustedNumsIndices(card);
		for (int j = 0; j < ij.second; j++) {
			seenAdjustedNums[ij.first][j]++;
		}
	}

	void unshiftSeenAdjustedNums(const Card& card) {
		const std::pair<int, int>& ij = getSeenAdjustedNumsIndices(card);
		for (int j = 0; j < ij.second; j++) {
			seenAdjustedNums[ij.first][j]--;
		}
	}

	int seenAdjustedNum(const Card& card) {
		const std::pair<int, int>& ij = getSeenAdjustedNumsIndices(card);
		return seenAdjustedNums[ij.first][ij.second];
	}

	int cardsLeftInSuit(int suit) {
		//std::cerr << "asked for suit=" << suit << ": i=" << suit << " j=" << 0 << std::endl;
		//printSeenAdjustedNums();
		//std::cerr << "ans=" << 14 - core->config.lowCard - seenAdjustedNums[suit][0] << std::endl;
		//std::cerr << std::endl;
		return 14 - core->config.lowCard - seenAdjustedNums[suit][0];
	}

	bool canWinTrick(int index, Log* log) {
		// positive status <==> player can win the trick

		bool isCurrentlyWinning = index == core->currentTrickWinner;
		if (isCurrentlyWinning) {
			if (log) {
				log->write(index, "yes: already winning");
			}
			return true;
		}

		bool hasPlayed = (index + core->config.N - core->leader) % core->config.N < core->playIndex;
		if (hasPlayed) {
			if (log) {
				log->write(index, "no: already losing");
			}
			return false;
		}

		const Card& winningCard = core->players[core->currentTrickWinner]->trick;
		const std::pair<int, int>& ij = getSeenAdjustedNumsIndices(winningCard);
		bool winnerIsHigh = seenAdjustedNums[ij.first][ij.second] == 13 - core->deck->lowCard;
		bool winnerIsTrump = ij.first == 0;
		if (winnerIsHigh && winnerIsTrump) {
			if (log) {
				log->write(index, "no: current winner is high trump");
			}
			return false;
		}

		bool* showedOuts = core->players[index]->showedOut;
		bool mightHaveTrump = cardsLeftInSuit(0) > 0 && !showedOuts[core->trump];
		if (mightHaveTrump) {
			if (log) {
				log->write(index, "yes: may have higher trump");
			}
			return true;
		}

		if (winnerIsHigh) {
			if (log) {
				log->write(index, "no: cannot trump and current winner is high");
			}
			return false;
		}

		bool mightHaveFollow = cardsLeftInSuit((core->follow + 4 - core->trump) % 4) > 0 && !showedOuts[core->follow];
		if (!mightHaveFollow) {
			if (log) {
				log->write(index, "no: cannot trump or follow suit");
			}
			return false;
		}

		if (log) {
			log->write(index, "yes: may have higher card in led suit");
		}
		return true;
	}

	void printSeenAdjustedNums() {
		for (auto& s : seenAdjustedNums) {
			for (auto& x : s) {
				std::cerr << x << " ";
			}
			std::cerr << std::endl;
		}
	}

	void logSeenAdjustedNums(Log& log) {
		for (int i = 0; i < (int)seenAdjustedNums.size(); i++) {
			auto& s = seenAdjustedNums[i];
			log.openFlatList(i);
			for (auto& x : s) {
				log.write(x);
			}
			log.close();
		}
	}

	const Card& chooseRandomCard();

	double greed;
	std::vector<int> cardsPlayed;
	std::vector<std::vector<int>> seenAdjustedNums;
};

class OITTrumpDecision : public Diff {
public:
	OITTrumpDecision(EuchrePlayerOIT& player) : Diff(0, player.log()), player(player) {}

	std::vector<std::shared_ptr<Diff>> children() override;

	std::string cls() override { return "TrumpDecision"; }
	std::string name() override { return "choices"; }

	EuchrePlayerOIT& player;
};

class OITTrumpDiff : public Diff {
public:
	OITTrumpDiff(EuchrePlayerOIT& player, int suit, bool alone, double p) : Diff(p, player.log()), player(player), trumpChoice(suit, alone), undoRoot(nullptr) {}

	std::vector<std::shared_ptr<Diff>> children() override;
	void apply() override;
	void undo() override;

	int weight() override;

	std::string cls() override { return "TrumpDiff"; }
	std::string name() override;

	void logExtraDetails() override;

	EuchreCoreOIT* core() {
		return dynamic_cast<EuchreCoreOIT*>(player.core);
	}

	EuchrePlayerOIT& player;
	TrumpChoice trumpChoice;

	std::shared_ptr<EuchreCoreOIT::Undo> undoRoot;
};

class OITDiscardDecision : public Diff {
public:
	OITDiscardDecision(EuchrePlayerOIT& player) : Diff(0, player.log()), player(player) {}

	std::vector<std::shared_ptr<Diff>> children() override;

	std::string cls() override { return "DiscardDecision"; }
	std::string name() override { return "choices"; }

	EuchrePlayerOIT& player;
};

class OITDiscardDiff : public Diff {
public:
	OITDiscardDiff(EuchrePlayerOIT& player, const Card& card) : Diff(1.0, player.log()), player(player), card(card) {}

	std::vector<std::shared_ptr<Diff>> children() override;
	void apply() override;
	void undo() override;

	std::string cls() override { return "DiscardDiff"; }
	std::string name() override;

	void logExtraDetails() override;

	EuchreCoreOIT* core() {
		return dynamic_cast<EuchreCoreOIT*>(player.core);
	}

	EuchrePlayerOIT& player;
	Card card;
};

class OITPlayDecision : public Diff {
public:
	OITPlayDecision(EuchrePlayerOIT& player, std::vector<const Card*>& canPlay) : Diff(0, player.log()), player(player), canPlay(canPlay) {}

	std::vector<std::shared_ptr<Diff>> children() override;

	std::string cls() override { return "PlayDecision"; }
	std::string name() override { return "choices"; }

	EuchrePlayerOIT& player;
	std::vector<const Card*>& canPlay;
};

class OITPlayDiff : public Diff {
public:
	// Important to copy card here because we may want to erase it from the set that owns it.
	OITPlayDiff(EuchrePlayerOIT& player, const Card& card, double p)
		: Diff(p, player.log()), player(player), card(card), undoRoot(nullptr) {}

	std::vector<std::shared_ptr<Diff>> children() override;
	void apply() override;
	void undo() override;

	std::string cls() override { return "PlayDiff"; }
	std::string name() override;

	void logExtraDetails() override;

	EuchreCoreOIT* core() {
		return dynamic_cast<EuchreCoreOIT*>(player.core);
	}

	EuchrePlayerOIT& player;
	Card card;

	std::shared_ptr<EuchreCoreOIT::Undo> undoRoot;
	std::vector<double> adjustedProbs;
};

class OITTrickWinnerDiff : public Diff {
public:
	OITTrickWinnerDiff(EuchrePlayerOIT& player, int index, double p)
		: Diff(p, player.log()), player(player), index(index), undoRoot(nullptr) {}

	std::vector<std::shared_ptr<Diff>> children() override;
	void apply() override;
	void undo() override;

	std::string cls() override { return "TrickWinnerDiff"; }
	std::string name() override;

	void logExtraDetails() override;

	EuchreCoreOIT* core() {
		return dynamic_cast<EuchreCoreOIT*>(player.core);
	}

	EuchrePlayerOIT& player;
	int index;

	std::shared_ptr<EuchreCoreOIT::Undo> undoRoot;
};

class OITTrickCountDiff : public Diff {
public:
	OITTrickCountDiff(EuchrePlayerOIT& player, int count, double p)
		: Diff(p, player.log()), player(player), count(count), undoRoot(nullptr) {}

	std::vector<std::shared_ptr<Diff>> children() override;
	void apply() override;
	void undo() override;

	std::string cls() override { return "TrickCountDiff"; }
	std::string name() override;

	void logExtraDetails() override;

	EuchreCoreOIT* core() {
		return dynamic_cast<EuchreCoreOIT*>(player.core);
	}

	EuchrePlayerOIT& player;
	int count;

	std::shared_ptr<EuchreCoreOIT::Undo> undoRoot;
};

class OITWinDiff : public TerminalDiff {
public:
	OITWinDiff(EuchrePlayerOIT& player, double p) : TerminalDiff(p, 1.0, player.log()) {}

	std::string cls() override { return "WinDiff"; }
	std::string name() override { return "win"; }
};