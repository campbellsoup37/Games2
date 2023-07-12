#include "core_oit.h"
#include "math_util.h"

// ML

void OITFeatureShowedOuts::set(int suit, bool value) {
	int rotated = (suit + 4 - trump) % 4;
	FeatureDense::set(rotated, value ? 1.0 : 0.0);
}

void OITFeatureShowedOuts::log(Log& logger) {
	if (logger.logging) {
		logger.openFlatDict(name);
		logger.write("d", d);
		logger.write("offset", offset);
		logger.openFlatList("suits");
		for (int i = 0; i < d; i++) {
			if (values[i] == 1.0) {
				int unrotated = (i + trump) % 4;
				logger.write(Card::suitString(unrotated));
			}
		}
		logger.close();
		logger.openFlatList("indices");
		for (int position : positions) {
			if (position >= 0) {
				logger.write(vec.indices[position][1]);
			}
		}
		logger.close();
		logger.close();
	}
}

std::vector<std::string> OITFeatureShowedOuts::labels() {
	std::vector<std::string> ans;
	for (int i = 0; i < d; i++) {
		int unrotated = (i + trump) % 4;
		ans.push_back(Card::suitString(unrotated));
	}
	return ans;
}

void OITFeatureCard::set(const Card* card) {
	FeatureOneHot::set(card->num);
}

void OITFeatureCard::log(Log& logger) {
	if (logger.logging) {
		logger.openFlatDict(name);
		logger.write("d", d);
		logger.write("offset", offset);
		logger.write("card", Card::numString(value));
		if (position >= 0) {
			logger.write("index", vec.indices[position][1]);
		}
		logger.close();
	}
}

std::vector<std::string> OITFeatureCard::labels() {
	std::vector<std::string> ans;
	for (int i = lowCard; i <= 12; i++) {
		ans.push_back(Card::numString(i));
	}
	return ans;
}

std::vector<std::string> OITFeatureUpCardStatus::labels() {
	std::vector<std::string> ans = { "down", "played" };
	for (int i = 0; i < N; i++) {
		ans.push_back("drawn_by_" + std::to_string(i));
	}
	return ans;
}

// oIn
OITOIn::OITOIn(const EuchreCoreOIT& core, int trump, int index) :
	trump(trump),
	indexOffset((core.config.N - index) % core.config.N),
	handSize(*this, "hand_size", core.config.h),
	adjustedNum(*this, "adjusted_num", 13 - core.config.lowCard),
	adjustedSuit(*this, "adjusted_suit", 3),
	upCard(*this, "up_card", core.deck->lowCard),
	upCardStatus(*this, "up_card_status", core.config.N),
	declarer(*this, "declarer", core.config.N - 1),
	alone(*this, "alone", 1),
	leader(*this, "leader", core.config.N - 1)
{
	for (int i = 0; i < core.config.N / 2; i++) {
		teamFeatures.push_back(std::make_unique<TeamFeatures>(*this, core, std::to_string(i)));
	}
	for (int i = 0; i < core.config.N; i++) {
		playerFeatures.push_back(std::make_unique<PlayerFeatures>(*this, core, std::to_string(i)));
	}
	unseens.push_back(std::make_unique<FeatureOneHot>(*this, "0_unseen", 14 - core.config.lowCard));
	unseens.push_back(std::make_unique<FeatureOneHot>(*this, "1_unseen", 13 - core.config.lowCard));
	unseens.push_back(std::make_unique<FeatureOneHot>(*this, "2_unseen", 12 - core.config.lowCard));
	unseens.push_back(std::make_unique<FeatureOneHot>(*this, "3_unseen", 13 - core.config.lowCard));
}

OITOIn::TeamFeatures::TeamFeatures(OITOIn& oIn, const EuchreCoreOIT& core, std::string i) :
	score(oIn, i + "_score", core.config.winningPoints - 1)
{}

OITOIn::PlayerFeatures::PlayerFeatures(OITOIn& oIn, const EuchreCoreOIT& core, std::string i) :
	showedOuts(oIn, i + "_showed_outs", oIn.trump),
	taken(oIn, i + "_taken", core.config.h - 1)
{}

// iIn
OITIIn::OITIIn(const EuchreCoreOIT& core, int trump, int index) :
	trump(trump),
	indexOffset((core.config.N - index) % core.config.N),
	handSize(*this, "hand_size", core.config.h),
	upCard(*this, "up_card", core.deck->lowCard),
	upCardStatus(*this, "up_card_status", core.config.N),
	declarer(*this, "declarer", core.config.N - 1),
	alone(*this, "alone", 1),
	leader(*this, "leader", core.config.N - 1),
	follow(*this, "follow", 3),
	winnerAdjustedNum(*this, "winner_adjusted_num", 13 - core.config.lowCard),
	winnerIsTrump(*this, "winner_is_trump", 1)
{
	for (int i = 0; i < core.config.N / 2; i++) {
		teamFeatures.push_back(std::make_unique<TeamFeatures>(*this, core, std::to_string(i)));
	}
	for (int i = 0; i < core.config.N; i++) {
		playerFeatures.push_back(std::make_unique<PlayerFeatures>(*this, core, std::to_string(i)));
	}
	unseens.push_back(std::make_unique<FeatureOneHot>(*this, "0_unseen", 14 - core.config.lowCard));
	unseens.push_back(std::make_unique<FeatureOneHot>(*this, "1_unseen", 13 - core.config.lowCard));
	unseens.push_back(std::make_unique<FeatureOneHot>(*this, "2_unseen", 12 - core.config.lowCard));
	unseens.push_back(std::make_unique<FeatureOneHot>(*this, "3_unseen", 13 - core.config.lowCard));
}

OITIIn::TeamFeatures::TeamFeatures(OITIIn& iIn, const EuchreCoreOIT& core, std::string i) :
	score(iIn, i + "_score", core.config.winningPoints - 1)
{}

OITIIn::PlayerFeatures::PlayerFeatures(OITIIn& iIn, const EuchreCoreOIT& core, std::string i) :
	showedOuts(iIn, i + "_showed_outs", iIn.trump),
	taken(iIn, i + "_taken", core.config.h - 1),
	playedStatus(iIn, i + "_playedStatus", 2)
{}

// tIn
OITTIn::OITTIn(const EuchreCoreOIT& core, int trump, int index) :
	trump(trump),
	indexOffset((core.config.N - index) % core.config.N),
	handSize(*this, "hand_size", core.config.h),
	upCard(*this, "up_card", core.deck->lowCard),
	upCardStatus(*this, "up_card_status", core.config.N),
	declarer(*this, "declarer", core.config.N - 1),
	alone(*this, "alone", 1),
	leader(*this, "leader", core.config.N - 1)
{
	for (int i = 0; i < core.config.N / 2; i++) {
		teamFeatures.push_back(std::make_unique<TeamFeatures>(*this, core, std::to_string(i)));
	}
	for (int i = 0; i < core.config.N; i++) {
		playerFeatures.push_back(std::make_unique<PlayerFeatures>(*this, core, std::to_string(i)));
	}
	unseens.push_back(std::make_unique<FeatureOneHot>(*this, "0_unseen", 14 - core.config.lowCard));
	unseens.push_back(std::make_unique<FeatureOneHot>(*this, "1_unseen", 13 - core.config.lowCard));
	unseens.push_back(std::make_unique<FeatureOneHot>(*this, "2_unseen", 12 - core.config.lowCard));
	unseens.push_back(std::make_unique<FeatureOneHot>(*this, "3_unseen", 13 - core.config.lowCard));
}

OITTIn::TeamFeatures::TeamFeatures(OITTIn& tIn, const EuchreCoreOIT& core, std::string i) :
	score(tIn, i + "_score", core.config.winningPoints - 1)
{}

OITTIn::PlayerFeatures::PlayerFeatures(OITTIn& tIn, const EuchreCoreOIT& core, std::string i) :
	showedOuts(tIn, i + "_showed_outs", tIn.trump),
	taken(tIn, i + "_taken", core.config.h - 1)
{}

// wIn

OITWIn::OITWIn(const EuchreCoreOIT& core) : scores(*this, "scores", (int)pow(core.config.winningPoints, core.config.N / 2) - 1) {}

// core and undo

void EuchreCoreOIT::initialize() {
	EuchreCore::initialize();
	emptyOIn = std::make_shared<OITOIn>(*this, 0, 0);
	emptyIIn = std::make_shared<OITIIn>(*this, 0, 0);
	emptyTIn = std::make_shared<OITTIn>(*this, 0, 0);
	emptyWIn = std::make_shared<OITWIn>(*this);
}

std::shared_ptr<EuchrePlayer> EuchreCoreOIT::createPlayer(int index) {
	return std::make_shared<EuchrePlayerOIT>(this, index);
}

void EuchreCoreOIT::dealSetup() {
	EuchreCore::dealSetup();
	for (auto player : players) {
		dynamic_cast<EuchrePlayerOIT&>(*player).resetSeenAdjustedNums();
	}

	initializeWIn();
	wInCache.push_back(wIn);
}

void EuchreCoreOIT::trumpChoiceApplied(int index, TrumpChoice& choice) {
	EuchreCore::trumpChoiceApplied(index, choice);

	if (!choice.pass) {
		for (auto& player : players) {
			auto& playerOit = dynamic_cast<EuchrePlayerOIT&>(*player);
			for (const Card& card : player->hand) {
				playerOit.shiftSeenAdjustedNums(card);
			}
			if (trumpPhase == EuchreTrumpPhase::DOWN) {
				playerOit.shiftSeenAdjustedNums(upCard);
			}
		}
	}
}

std::shared_ptr<EuchreCoreOIT::Undo> EuchreCoreOIT::applyTrumpChoiceHypo(EuchrePlayerOIT& owner, TrumpChoice& choice) {
	std::shared_ptr<EuchreCoreOIT::Undo> undo = std::make_shared<EuchreCoreOIT::UnapplyTrumpChoice>(*this, owner, choice, trumpPhase);

	EuchreCore::applyTrumpChoice(owner.index, choice);
	if (!choice.pass) {
		for (const Card& card : owner.hand) {
			owner.shiftSeenAdjustedNums(card);
		}
		if (trumpPhase == EuchreTrumpPhase::DOWN) {
			owner.shiftSeenAdjustedNums(upCard);
		}
	}

	return undo;
}

void EuchreCoreOIT::UnapplyTrumpChoice::undo() {
	if (choice.pass) {
		core.trumpIndex = (core.trumpIndex + core.config.N - 1) % core.config.N;
	}
	if (core.trumpPhase != prevTrumpPhase) {
		core.deck->unplayCard(core.upCard);
		core.trumpPhase = prevTrumpPhase;
	}
	if (!choice.pass) {
		for (const Card& card : owner.hand) {
			owner.unshiftSeenAdjustedNums(card);
		}
		if (core.trumpPhase == EuchreTrumpPhase::DOWN) {
			owner.unshiftSeenAdjustedNums(core.upCard);
		}
	}
	core.trump = -1;
	core.alone = false;
	core.declarer = -1;
	core.orderedUp = false;
	core.sittingOut = -1;
	core.leader = (core.roundNumber + 1) % core.config.N;
}

void EuchreCoreOIT::playSetup() {
	for (auto& player : players) {
		dynamic_cast<EuchrePlayerOIT&>(*player).cardsPlayed.clear();
	}
	EuchreCore::playSetup();
}

void EuchreCoreOIT::cardPlayed(int index, const Card& card) {
	std::shared_ptr<EuchrePlayer> player = players[index];
	dynamic_cast<EuchrePlayerOIT&>(*player).cardsPlayed.push_back(card.code);
	for (auto other : players) {
		if (other->index != index) {
			dynamic_cast<EuchrePlayerOIT&>(*other).shiftSeenAdjustedNums(card);
		}
	}

	if (playIndex == config.N) {
		for (auto player : players) {
			if (player->index != sittingOut) {
				int code = player->trick.code;
				std::shared_ptr<std::vector<double>> out = std::make_shared<std::vector<double>>(std::vector<double>{ player->index == leader ? 1.0 : 0.0 });
				for (auto in : oInCache[code]) {
					oData.emplace_back(in, out);
				}
				oInCache.erase(code);
			}
		}

		for (auto& pair : iInCache) {
			std::shared_ptr<std::vector<double>> out = std::make_shared<std::vector<double>>(std::vector<double>(config.N, 0.0));
			(*out)[(leader + config.N - pair.first) % config.N] = 1.0;
			iData.emplace_back(pair.second, out);
		}
		iInCache.clear();
	}

	EuchreCore::cardPlayed(index, card);
}

std::shared_ptr<EuchreCoreOIT::Undo> EuchreCoreOIT::playCardHypo(EuchrePlayerOIT& owner, const Card& card) {
	std::shared_ptr<EuchreCoreOIT::Undo> undo = std::make_shared<EuchreCoreOIT::UnplayCard>(*this, owner, card);

	int prevLeader = leader;
	EuchreCore::playCard(owner.index, card);

	return undo;
}

EuchreCoreOIT::UnplayCard::UnplayCard(EuchreCoreOIT& core, EuchrePlayerOIT& owner, const Card& card)
	: Undo(core), owner(owner), card(card), prevFollow(core.follow), prevShowedOut(prevFollow != -1 ? owner.showedOut[prevFollow] : false), 
	prevPlayIndex(core.playIndex), prevTrickWinner(core.currentTrickWinner)
{
	next = std::make_shared<EuchreCoreOIT::UnevaluateTrick>(core, owner);
}

void EuchreCoreOIT::UnplayCard::undo() {
	// base core
	core.currentTrickWinner = prevTrickWinner;
	core.playIndex = prevPlayIndex;
	core.follow = prevFollow;
	if (prevFollow != -1) {
		owner.showedOut[prevFollow] = prevShowedOut;
	}

	core.deck->unplayCard(card);
}

std::shared_ptr<EuchreCoreOIT::Undo> EuchreCoreOIT::evaluateTrickHypo(EuchrePlayerOIT& owner, int winner) {
	std::shared_ptr<EuchreCoreOIT::Undo> undo = std::make_shared<EuchreCoreOIT::UnevaluateTrick>(*this, owner);

	leader = winner;
	playIndex = config.N;
	EuchreCore::evaluateTrick();

	return undo;
}

EuchreCoreOIT::UnevaluateTrick::UnevaluateTrick(EuchreCoreOIT& core, EuchrePlayerOIT& owner) : Undo(core), owner(owner), prevLeader(core.leader), prevPlayIndex(core.playIndex) {
	next = std::make_shared<EuchreCoreOIT::Unscore>(core);
}

void EuchreCoreOIT::UnevaluateTrick::undo() {
	if (core.playIndex < core.config.N) {
		return;
	}

	int newLeader = core.leader;

	core.players[newLeader]->taken--;
	core.trickIndex--;
	core.leader = prevLeader;
	core.playIndex = prevPlayIndex;
}

std::shared_ptr<EuchreCoreOIT::Undo> EuchreCoreOIT::evaluateRoundHypo(EuchrePlayerOIT& owner, int taken) {
	std::shared_ptr<EuchreCoreOIT::Undo> undo = std::make_shared<EuchreCoreOIT::UnevaluateRound>(*this);

	players[declarer]->taken += taken;
	trickIndex = config.h;
	EuchreCore::evaluateRound();

	return undo;
}

EuchreCoreOIT::UnevaluateRound::UnevaluateRound(EuchreCoreOIT& core) : Undo(core), prevTrickIndex(core.trickIndex), prevDeclarerTaken(core.players[core.declarer]->taken) {
	next = std::make_shared<EuchreCoreOIT::Unscore>(core);
}

void EuchreCoreOIT::UnevaluateRound::undo() {
	core.players[core.declarer]->taken = prevDeclarerTaken;
	core.trickIndex = prevTrickIndex;
}

void EuchreCoreOIT::Unscore::undo() {
	if (core.roundResult == EuchreRoundResult::UNFINISHED) {
		return;
	}

	core.roundResult = EuchreRoundResult::UNFINISHED;
	for (int i = 0; i < (int)prevScores.size(); i++) {
		core.scores[i] = prevScores[i];
	}
	core.gameOver = false;
	core.winningScore = -1;
	core.roundNumber--;
}

void EuchreCoreOIT::scored() {
	EuchreCore::scored();

	for (auto& pair : tInCache) {
		std::shared_ptr<std::vector<double>> out = std::make_shared<std::vector<double>>(std::vector<double>(config.h + 1, 0.0));
		(*out)[players[(pair.first + config.N / 2) % config.N]->taken] = 1.0;
		tData.emplace_back(pair.second, out);
	}
	tInCache.clear();

	if (gameOver) {
		int numWinners = 0;
		for (int score : scores) {
			if (score == winningScore) {
				numWinners++;
			}
		}
		std::vector<std::shared_ptr<std::vector<double>>> outRotation;
		for (int d = 0; d < config.N / 2; d++) {
			outRotation.push_back(std::make_shared<std::vector<double>>());
			auto& out = outRotation.back();
			for (int i = 0; i < config.N / 2; i++) {
				int score = scores[(i + d + 1) % (config.N / 2)];
				double val = score == winningScore ? 1.0 / numWinners : 0.0;
				out->push_back(val);
			}
		}
		for (int rn = 0; rn < (int)wInCache.size(); rn++) {
			wData.emplace_back(wInCache[rn], outRotation[rn % (config.N / 2)]);
		}
		wInCache.clear();
	}
}

void EuchreCoreOIT::calculatePTQ(int index, bool alone, Log* log) {
	auto& owner = dynamic_cast<EuchrePlayerOIT&>(*players[index]);

	// p
	p.clear();
	if (log) {
		log->openDict("pvec");
	}
	for (const Card& card : owner.hand) {
		std::shared_ptr<OITOIn> oIn = initializeOIn(index);
		oIn->adjustedNum.set(owner.seenAdjustedNum(card));
		oIn->adjustedSuit.set((EuchreDeck::trumpAdjustedSuit(card, trump) + 4 - trump) % 4);

		double x = (*oModel(*oIn))[0];
		p.push_back(x);
		if (log) {
			log->openDict(card.toString());
			log->openDict("oIn");
			oIn->log(*log);
			log->close();
			log->write("prob", x);
			log->close();
		}

		oInCache[card.code].push_back(oIn);
	}
	if (log) {
		log->close();
	}

	// q
	subsetProb(p, q);

	// t
	t.clear();
	if (!(alone && index == declarer)) {
		std::shared_ptr<OITTIn> tIn = initializeTIn(index);
		std::shared_ptr<std::vector<double>> probs = tModel(*tIn);
		t.insert(t.end(), probs->begin(), probs->end());
		if (log) {
			log->openDict("tvec");
			log->openDict("tIn");
			tIn->log(*log);
			log->close();
			log->openFlatDict("probs");
			for (int i = 0; i < (int)t.size(); i++) {
				log->write(i, t[i]);
			}
			log->close();
			log->close();
		}
		std::vector<double> qCombo;
		double denom = 0;
		for (int i = 0; i < (int)q.size(); i++) {
			double x = 0;
			for (int j = 0; j <= i; j++) {
				x += q[j] * t[i - j];
			}
			qCombo.push_back(x);
			denom += x;
		}
		for (int i = 0; i < (int)q.size(); i++) {
			q[i] = qCombo[i] / denom;
		}
		tInCache.emplace_back(std::pair<int, std::shared_ptr<SparseVector>>{index, tIn});
	}

	if (log) {
		log->openFlatDict("qvec");
		for (int i = 0; i < (int)q.size(); i++) {
			log->write(i, q[i]);
		}
		log->close();
	}
}

std::shared_ptr<OITOIn> EuchreCoreOIT::initializeOIn(int index) {
	std::shared_ptr<OITOIn> oIn = std::make_shared<OITOIn>(*this, trump, index);

	auto& owner = dynamic_cast<EuchrePlayerOIT&>(*players[index]);

	// don't change
	oIn->handSize.set((int)owner.hand.size());
	oIn->upCard.set(&upCard);
	oIn->upCardStatus.set(getUpCardStatus());
	oIn->declarer.set((declarer + oIn->indexOffset) % config.N);
	oIn->alone.set(alone);
	oIn->leader.set((leader + oIn->indexOffset) % config.N);
	for (int i = 0; i < 4; i++) {
		oIn->unseens[i]->set(owner.cardsLeftInSuit(i));
	}
	for (auto& player : players) {
		auto& pFeatures = oIn->playerFeatures[(player->index + oIn->indexOffset) % config.N];
		for (int i = 0; i < 4; i++) {
			pFeatures->showedOuts.set(i, player->showedOut[i]);
		}
		pFeatures->taken.set(player->taken);
	}
	for (int i = 0; i < config.N / 2; i++) {
		auto& tFeatures = oIn->teamFeatures[(i + oIn->indexOffset) % (config.N / 2)];
		tFeatures->score.set(scores[i]);
	}

	return oIn;
}

std::shared_ptr<OITIIn> EuchreCoreOIT::initializeIIn(int index) {
	std::shared_ptr<OITIIn> iIn = std::make_shared<OITIIn>(*this, trump, index);

	auto& owner = dynamic_cast<EuchrePlayerOIT&>(*players[index]);

	// don't change
	iIn->handSize.set((int)owner.hand.size());
	iIn->upCard.set(&upCard);
	iIn->upCardStatus.set(getUpCardStatus());
	iIn->declarer.set((declarer + iIn->indexOffset) % config.N);
	iIn->alone.set(alone);
	iIn->leader.set((leader + iIn->indexOffset) % config.N);
	iIn->follow.set((follow + 4 - trump) % 4);
	iIn->winnerAdjustedNum.set(owner.seenAdjustedNum(players[currentTrickWinner]->trick));
	iIn->winnerIsTrump.set(EuchreDeck::trumpAdjustedSuit(players[currentTrickWinner]->trick, trump) == trump ? 1 : 0);
	for (int i = 0; i < 4; i++) {
		iIn->unseens[i]->set(owner.cardsLeftInSuit(i));
	}
	for (auto& player : players) {
		auto& pFeatures = iIn->playerFeatures[(player->index + iIn->indexOffset) % config.N];
		for (int i = 0; i < 4; i++) {
			pFeatures->showedOuts.set(i, player->showedOut[i]);
		}
		pFeatures->taken.set(player->taken);
		if ((player->index + config.N - leader) % config.N >= playIndex) {
			pFeatures->playedStatus.set(2);
		}
		else if (player->index == currentTrickWinner) {
			pFeatures->playedStatus.set(1);
		}
		else {
			pFeatures->playedStatus.set(0);
		}
	}
	for (int i = 0; i < config.N / 2; i++) {
		auto& tFeatures = iIn->teamFeatures[(i + iIn->indexOffset) % (config.N / 2)];
		tFeatures->score.set(scores[i]);
	}

	return iIn;
}

std::shared_ptr<OITTIn> EuchreCoreOIT::initializeTIn(int index) {
	std::shared_ptr<OITTIn> tIn = std::make_shared<OITTIn>(*this, trump, index);

	auto& owner = dynamic_cast<EuchrePlayerOIT&>(*players[index]);

	// don't change
	tIn->handSize.set((int)owner.hand.size());
	tIn->upCard.set(&upCard);
	tIn->upCardStatus.set(getUpCardStatus());
	tIn->declarer.set((declarer + tIn->indexOffset) % config.N);
	tIn->alone.set(alone);
	tIn->leader.set((leader + tIn->indexOffset) % config.N);
	for (int i = 0; i < 4; i++) {
		tIn->unseens[i]->set(owner.cardsLeftInSuit(i));
	}
	for (auto& player : players) {
		auto& pFeatures = tIn->playerFeatures[(player->index + tIn->indexOffset) % config.N];
		for (int i = 0; i < 4; i++) {
			pFeatures->showedOuts.set(i, player->showedOut[i]);
		}
		pFeatures->taken.set(player->taken);
	}
	for (int i = 0; i < config.N / 2; i++) {
		auto& tFeatures = tIn->teamFeatures[(i + tIn->indexOffset) % (config.N / 2)];
		tFeatures->score.set(scores[i]);
	}

	return tIn;
}

void EuchreCoreOIT::initializeWIn() {
	wIn = std::make_shared<OITWIn>(*this);
	int code = 0;
	for (int i = 0; i < config.N / 2; i++) {
		code = config.winningPoints * code + scores[(i + roundNumber + 1) % (config.N / 2)];
	}
	wIn->scores.set(code);
}

std::shared_ptr<std::vector<double>> EuchreCoreOIT::getWOut() {
	int code = 0;
	for (int i = 0; i < scores.size(); i++) {
		int score = scores[(i + roundNumber + 1) % scores.size()];
		if (score >= config.winningPoints) {
			std::stringstream ss;
			ss << "Evaluating wnn with invalid score " << score;
			throw std::runtime_error(ss.str());
		}
		code = config.winningPoints * code + score;
	}

	auto& memo = wOutMemo[code];
	if (memo == nullptr) {
		initializeWIn();
		memo = wModel(*wIn);
	}
	return memo;
}

void EuchreCoreOIT::clearData() {
	oData.clear();
	iData.clear();
	tData.clear();
	wData.clear();
}

void EuchreCoreOIT::logDebugDetails() {
	log.write("follow", follow);
	log.write("leader", leader);
	log.write("gameOver", gameOver);
	log.write("roundResult", roundResult);
	log.write("winningScore", winningScore);

	log.openDict("showedOut");
	for (auto& player : players) {
		log.openFlatList(player->index);
		for (int j = 0; j < 4; j++) {
			log.write(player->showedOut[j]);
		}
		log.close();
	}
	log.close();

	log.openFlatList("deck->cardsNotPlayed");
	for (auto& card : deck->cardsNotPlayed) {
		log.write(card.toString());
	}
	log.close();

	log.openDict("taken");
	for (auto& player : players) {
		log.write(player->index, player->taken);
	}
	log.close();

	log.openDict("score");
	for (int i = 0; i < (int)scores.size(); i++) {
		log.write(i, scores[i]);
	}
	log.close();
}

// player

void EuchrePlayerOIT::chooseTrump(int phase, bool stuck) {
	OITTrumpDecision decision(*this);

	double x = roll();
	if (x > greed) {
		readiedTrumpChoice = dynamic_cast<OITTrumpDiff&>(*decision.random(core->rng)).trumpChoice;
	}
	else {
		readiedTrumpChoice = dynamic_cast<OITTrumpDiff&>(*decision.best()).trumpChoice;
	}
}

void EuchrePlayerOIT::pickItUp() {
	OITDiscardDecision decision(*this);

	double x = roll();
	if (x > greed) {
		readiedDiscard = dynamic_cast<OITDiscardDiff&>(*decision.random(core->rng)).card;
	}
	else {
		readiedDiscard = dynamic_cast<OITDiscardDiff&>(*decision.best()).card;
	}
}

void EuchrePlayerOIT::play(std::vector<const Card*>& canPlay) {
	if (canPlay.size() == 1) {
		readiedPlay = *canPlay[0];
	}
	else {
		OITPlayDecision decision(*this, canPlay);

		double x = roll();
		if (x > greed) {
			readiedPlay = dynamic_cast<OITPlayDiff&>(*decision.random(core->rng)).card;
		}
		else {
			readiedPlay = dynamic_cast<OITPlayDiff&>(*decision.best()).card;
		}
	}
}

const Card& EuchrePlayerOIT::chooseRandomCard() {
	int h = (int)hand.size();
	for (const Card& card : hand) {
		if (core->rng() % h == 0) {
			return card;
		}
		h--;
	}
	// Shouldn't be reachable
	return *hand.begin();
}

// trump decision

std::vector<std::shared_ptr<Diff>> OITTrumpDecision::children() {
	std::vector<std::shared_ptr<Diff>> ans;
	EuchreCore& core = *player.core;

	if (!core.dealerStuck) {
		ans.push_back(std::make_shared<OITTrumpDiff>(player, -1, false, 1.0));
	}

	if (core.trumpPhase == EuchreTrumpPhase::UP) {
		ans.push_back(std::make_shared<OITTrumpDiff>(player, core.upCard.suit, false, 1.0));
		ans.push_back(std::make_shared<OITTrumpDiff>(player, core.upCard.suit, true, 1.0));
	}
	else if (core.trumpPhase == EuchreTrumpPhase::DOWN) {
		for (int suit = 0; suit < 4; suit++) {
			if (suit != core.upCard.suit) {
				ans.push_back(std::make_shared<OITTrumpDiff>(player, suit, false, 1.0));
				ans.push_back(std::make_shared<OITTrumpDiff>(player, suit, true, 1.0));
			}
		}
	}

	return ans;
}

std::vector<std::shared_ptr<Diff>> OITTrumpDiff::children() {
	std::vector<std::shared_ptr<Diff>> ans;
	EuchreCoreOIT& core = *this->core();

	if (core.trumpPhase == EuchreTrumpPhase::DECLARED) {
		if (core.trump == core.upCard.suit && player.index == core.roundNumber % core.config.N) {
			// Decide our discard
			OITDiscardDecision nextDecision(player);
			if (logging()) {
				log->openDict("subDecision");
			}
			std::shared_ptr<Diff> best = nextDecision.best();
			if (logging()) {
				log->close();
			}
			ans.push_back(std::make_shared<OITWinDiff>(player, best->cachedE));
		}
		else {
			for (int i = 0; i < core.q.size(); i++) {
				ans.push_back(std::make_shared<OITTrickCountDiff>(player, i, core.q[i]));
			}
		}
	}
	else if (core.trumpPhase == EuchreTrumpPhase::PASSED) {
		// TODO
		std::cerr << "implement passed out" << std::endl;
		exit(1);
		double q = (double)(player.core->rng() % 1000) / 1000;
		ans.push_back(std::make_shared<OITWinDiff>(player, q));
	}
	else {
		std::shared_ptr<std::vector<double>> probs = core.getWOut();
		double q = (*probs)[(player.index + core.roundNumber + 1) % (core.config.N / 2)];
		ans.push_back(std::make_shared<OITWinDiff>(player, q));
	}

	return ans;
}

void OITTrumpDiff::apply() {
	undoRoot = core()->applyTrumpChoiceHypo(player, trumpChoice);
	if (!trumpChoice.pass) {
		core()->calculatePTQ(player.index, core()->alone, logging() ? log : nullptr);
	}
}

void OITTrumpDiff::undo() {
	if (undoRoot != nullptr) {
		undoRoot->undoAll();
	}
}

int OITTrumpDiff::weight() {
	if (trumpChoice.pass) {
		return 9057;
	}
	if (trumpChoice.alone) {
		return 188;
	}
	return 755;
}

std::string OITTrumpDiff::name() {
	return trumpChoice.toString();
}

void OITTrumpDiff::logExtraDetails() {
	int turn = (player.core->trumpIndex + player.core->leader) % player.core->config.N;
	if (trumpChoice.pass && turn != player.index) {
		core()->initializeWIn();
		log->openDict("wIn");
		core()->wIn->log(*log);
		log->close();
	}
}

// discard decision

std::vector<std::shared_ptr<Diff>> OITDiscardDecision::children() {
	std::vector<std::shared_ptr<Diff>> ans;
	for (const Card& card : player.hand) {
		ans.push_back(std::make_shared<OITDiscardDiff>(player, card));
	}
	ans.push_back(std::make_shared<OITDiscardDiff>(player, player.core->upCard));
	return ans;
}

std::vector<std::shared_ptr<Diff>> OITDiscardDiff::children() {
	EuchreCoreOIT& core = *this->core();

	std::vector<std::shared_ptr<Diff>> ans;

	for (int i = 0; i < core.q.size(); i++) {
		int declarerTricks;
		if (player.index % (core.config.N / 2) == core.declarer % (core.config.N / 2)) {
			declarerTricks = i;
		}
		else {
			declarerTricks = (int)player.hand.size() - i;
		}
		ans.push_back(std::make_shared<OITTrickCountDiff>(player, declarerTricks, core.q[i]));
	}

	return ans;
}

void OITDiscardDiff::apply() {
	player.hand.insert(player.core->upCard);
	player.hand.erase(card);
	player.shiftSeenAdjustedNums(player.core->upCard);
	core()->calculatePTQ(player.index, core()->alone, logging() ? log : nullptr);
}

void OITDiscardDiff::undo() {
	player.unshiftSeenAdjustedNums(player.core->upCard);
	player.hand.insert(card);
	player.hand.erase(player.core->upCard);
}

std::string OITDiscardDiff::name() {
	return card.toString();
}

void OITDiscardDiff::logExtraDetails() {

}

// play decision

std::vector<std::shared_ptr<Diff>> OITPlayDecision::children() {
	std::vector<std::shared_ptr<Diff>> ans;
	for (const Card* card : canPlay) {
		ans.push_back(std::make_shared<OITPlayDiff>(player, *card, 1.0));
	}
	return ans;
}

std::vector<std::shared_ptr<Diff>> OITPlayDiff::children() {
	EuchreCoreOIT& core = *this->core();

	std::vector<std::shared_ptr<Diff>> ans;
	if (core.playIndex == core.config.N) {
		if (core.roundResult == EuchreRoundResult::UNFINISHED) {
			for (int i = 0; i < core.q.size(); i++) {
				int declarerTricks;
				if (player.index % (core.config.N / 2) == core.declarer % (core.config.N / 2)) {
					declarerTricks = i;
				}
				else {
					declarerTricks = (int)player.hand.size() - i;
				}
				ans.push_back(std::make_shared<OITTrickCountDiff>(player, declarerTricks, core.q[i]));
			}
		}
		else {
			double q = 0;
			if (core.gameOver) {
				if (player.didIWin()) {
					q = 1;
				}
			}
			else {
				std::shared_ptr<std::vector<double>> probs = core.getWOut();
				q = (*probs)[(player.index + core.roundNumber + 1) % (core.config.N / 2)];
			}
			ans.push_back(std::make_shared<OITWinDiff>(player, q));
		}
	}
	else {
		for (int i = 0; i < core.config.N; i++) {
			if (adjustedProbs[i] != 0) {
				int index = (core.leader + i) % core.config.N;
				ans.push_back(std::make_shared<OITTrickWinnerDiff>(player, index, adjustedProbs[i]));
			}
		}
	}
	return ans;
}

void OITPlayDiff::logExtraDetails() {

}

void OITPlayDiff::apply() {
	EuchreCoreOIT& core = *this->core();

	player.hand.erase(card);
	undoRoot = core.playCardHypo(player, card);

	if (core.playIndex == core.config.N) {
		if (core.roundResult == EuchreRoundResult::UNFINISHED) {
			core.calculatePTQ(player.index, core.alone, logging() ? log : nullptr);
		}
	}
	else {
		core.iIn = core.initializeIIn(player.index);
		core.iInCache.emplace_back(std::pair<int, std::shared_ptr<SparseVector>>{player.index, core.iIn});
		if (logging()) {
			log->openDict("iIn");
			core.iIn->log(*log);
			log->close();
			log->openDict("can player win trick");
		}

		std::shared_ptr<std::vector<double>> probs = core.iModel(*core.iIn);
		double denom = 0;
		for (int i = 0; i < core.config.N; i++) {
			int index = (core.leader + i) % core.config.N;
			double prob = 0;
			if (player.canWinTrick(index, logging() ? log : nullptr)) {
				prob = (*probs)[(index + core.iIn->indexOffset) % core.config.N];
			}
			adjustedProbs.push_back(prob);
			denom += prob;
		}
		for (int i = 0; i < core.config.N; i++) {
			adjustedProbs[i] /= denom;
		}
		if (logging()) {
			log->close();
		}
	}
}

void OITPlayDiff::undo() {
	player.hand.insert(card);
	if (undoRoot != nullptr) {
		undoRoot->undoAll();
	}
}

std::string OITPlayDiff::name() {
	return card.toString();
}

// child diffs

std::vector<std::shared_ptr<Diff>> OITTrickWinnerDiff::children() {
	EuchreCoreOIT& core = *this->core();
	std::vector<std::shared_ptr<Diff>> ans;

	if (core.roundResult == EuchreRoundResult::UNFINISHED) {
		for (int i = 0; i < core.q.size(); i++) {
			int declarerTricks;
			if (player.index % (core.config.N / 2) == core.declarer % (core.config.N / 2)) {
				declarerTricks = i;
			}
			else {
				declarerTricks = (int)player.hand.size() - i;
			}
			ans.push_back(std::make_shared<OITTrickCountDiff>(player, declarerTricks, core.q[i]));
		}
	}
	else {
		double q = 0;
		if (core.gameOver) {
			if (player.didIWin()) {
				q = 1;
			}
		}
		else {
			std::shared_ptr<std::vector<double>> probs = core.getWOut();
			q = (*probs)[(player.index + core.roundNumber + 1) % (core.config.N / 2)];
		}
		ans.push_back(std::make_shared<OITWinDiff>(player, q));
	}
	
	return ans;
}

void OITTrickWinnerDiff::logExtraDetails() {

}

void OITTrickWinnerDiff::apply() {
	EuchreCoreOIT& core = *this->core();

	undoRoot = core.evaluateTrickHypo(player, index);

	if (core.roundResult == EuchreRoundResult::UNFINISHED) {
		core.calculatePTQ(player.index, core.alone, logging() ? log : nullptr);
	}
}

void OITTrickWinnerDiff::undo() {
	if (undoRoot != nullptr) {
		undoRoot->undoAll();
	}
}

std::string OITTrickWinnerDiff::name() {
	return std::to_string(index) + "_wins";
}

std::vector<std::shared_ptr<Diff>> OITTrickCountDiff::children() {
	EuchreCoreOIT& core = *this->core();

	std::vector<std::shared_ptr<Diff>> ans;
	double q = 0;
	if (core.gameOver) {
		if (player.didIWin()) {
			q = 1;
		}
	}
	else {
		std::shared_ptr<std::vector<double>> probs = core.getWOut();
		q = (*probs)[(player.index + core.roundNumber + 1) % (core.config.N / 2)];
	}
	ans.push_back(std::make_shared<OITWinDiff>(player, q));
	return ans;
}

void OITTrickCountDiff::logExtraDetails() {
	core()->initializeWIn();
	log->openDict("wIn");
	core()->wIn->log(*log);
	log->close();
}

void OITTrickCountDiff::apply() {
	undoRoot = core()->evaluateRoundHypo(player, count);
}

void OITTrickCountDiff::undo() {
	if (undoRoot != nullptr) {
		undoRoot->undoAll();
	}
}

std::string OITTrickCountDiff::name() {
	return std::to_string(count) + "_taken";
}
