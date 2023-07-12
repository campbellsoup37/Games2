#include "core_markov.h"

// ML

int adjustedCode(int code, int trump, int lowCard) {
	int rotated = (code + 52 - 13 * trump) % 52;
	int suit = rotated / 13;
	int ans = rotated - lowCard * (suit + 1);

	return ans;
}

int unadjustedCode(int code, int trump, int lowCard) {
	int suit = code / (13 - lowCard);
	int rotated = code + lowCard * (suit + 1);
	int ans = (rotated + 13 * trump) % 52;

	return ans;
}

void FeatureCard::set(const Card* card) {
	int code = -1;
	if (card != nullptr) {
		code = adjustedCode(card->code, trump, lowCard);
	}
	FeatureOneHot::set(code);
}

void FeatureCard::log(Log& logger) {
	if (logger.logging) {
		logger.openFlatDict(name);
		logger.write("d", d);
		logger.write("offset", offset);
		if (value == -1) {
			logger.write("card", "");
		}
		else {
			int code = unadjustedCode(value, trump, lowCard);
			logger.write("card", Card(code).toString());
		}
		if (position >= 0) {
			logger.write("index", vec.indices[position][1]);
		}
		logger.close();
	}
}

std::vector<std::string> FeatureCard::labels() {
	std::vector<std::string> ans;
	for (int i = 0; i <= d; i++) {
		int value = min + i;
		if (value == -1) {
			ans.push_back("");
		}
		else {
			int code = unadjustedCode(value, trump, lowCard);
			ans.push_back(Card(code).toString());
		}
	}
	return ans;
}

void FeatureHand::set(const Hand& hand) {
	// This assumes the vector is empty beforehand.
	for (const Card& card : hand) {
		add(card);
	}
}

void FeatureHand::set(const std::vector<int>& hand, int exclude) {
	// This assumes the vector is empty beforehand.
	for (int code : hand) {
		if (code != exclude) {
			add(Card(code));
		}
	}
}

void FeatureHand::add(const Card& card) {
	FeatureDense::set(adjustedCode(card.code, trump, lowCard), 1.0);
}

void FeatureHand::remove(const Card& card) { 
	FeatureDense::set(adjustedCode(card.code, trump, lowCard), 0.0);
}

void FeatureHand::log(Log& logger) {
	if (logger.logging) {
		logger.openFlatDict(name);
		logger.write("d", d);
		logger.write("offset", offset);
		logger.openFlatList("cards");
		for (int i = 0; i < d; i++) {
			if (values[i] == 1.0) {
				int code = unadjustedCode(i, trump, lowCard);
				logger.write(Card(code).toString());
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

std::vector<std::string> FeatureHand::labels() {
	std::vector<std::string> ans;
	for (int i = 0; i < d; i++) {
		int code = unadjustedCode(i, trump, lowCard);
		ans.push_back(Card(code).toString());
	}
	return ans;
}

void FeatureShowedOuts::set(int suit, bool value) {
	int rotated = (suit + 4 - trump) % 4;
	FeatureDense::set(rotated, value ? 1.0 : 0.0);
}

void FeatureShowedOuts::log(Log& logger) {
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

std::vector<std::string> FeatureShowedOuts::labels() {
	std::vector<std::string> ans;
	for (int i = 0; i < d; i++) {
		int unrotated = (i + trump) % 4;
		ans.push_back(Card::suitString(unrotated));
	}
	return ans;
}

// tIn

TIn::TIn(const EuchreCoreMarkov& core, int trump) :
	trump(trump),
	me(*this, "me", core.config.N - 1),
	myHand(*this, "my_hand", core.deck->lowCard, trump),
	upCard(*this, "up_card", false, core.deck->lowCard, trump, true),
	phase(*this, "phase", 2, 1),
	turn(*this, "turn", core.config.N - 1)
{
	for (int i = 0; i < core.config.N / 2; i++) {
		teamFeatures.push_back(std::make_unique<TeamFeatures>(*this, core, std::to_string(i)));
	}
}

TIn::TeamFeatures::TeamFeatures(TIn& tIn, const EuchreCoreMarkov& core, std::string i) :
	score(tIn, i + "_score", core.config.winningPoints - 1)
{}

// pIn

PIn::PIn(const EuchreCoreMarkov& core, int trump) :
	trump(trump),
	me(*this, "me", core.config.N - 1),
	myHand(*this, "my_hand", core.deck->lowCard, trump),
	upCard(*this, "up_card", false, core.deck->lowCard, trump, false),
	declarer(*this, "declarer", core.config.N - 1),
	alone(*this, "alone", 1),
	dealer(*this, "dealer", core.config.N - 1)
{
	for (int i = 0; i < core.config.N / 2; i++) {
		teamFeatures.push_back(std::make_unique<TeamFeatures>(*this, core, std::to_string(i)));
	}
	for (int i = 0; i < core.config.N; i++) {
		playerFeatures.push_back(std::make_unique<PlayerFeatures>(*this, core, std::to_string(i)));
	}
}

PIn::TeamFeatures::TeamFeatures(PIn& pIn, const EuchreCoreMarkov& core, std::string i) :
	taken(pIn, i + "_taken", core.config.h - 1),
	score(pIn, i + "_score", core.config.winningPoints - 1)
{}

PIn::PlayerFeatures::PlayerFeatures(PIn& pIn, const EuchreCoreMarkov& core, std::string i) :
	trick(pIn, i + "_trick", true, core.deck->lowCard, pIn.trump, false),
	showedOuts(pIn, i + "_showed_outs", pIn.trump),
	cardsPlayed(pIn, i + "_cards_played", core.deck->lowCard, pIn.trump)
{}

// rIn

RIn::RIn(const EuchreCoreMarkov& core, int trump, int leader) :
	trump(trump),
	leader(leader),
	me(*this, "me", core.config.N - 1),
	myHand(*this, "my_hand", core.deck->lowCard, trump),
	upCard(*this, "up_card", false, core.deck->lowCard, trump, false),
	declarer(*this, "declarer", core.config.N - 1),
	alone(*this, "alone", 1),
	dealer(*this, "dealer", core.config.N - 1)
{
	for (int i = 0; i < core.config.N / 2; i++) {
		teamFeatures.push_back(std::make_unique<TeamFeatures>(*this, core, std::to_string(i)));
	}
	for (int i = 0; i < core.config.N; i++) {
		playerFeatures.push_back(std::make_unique<PlayerFeatures>(*this, core, std::to_string(i)));
	}
}

RIn::TeamFeatures::TeamFeatures(RIn& rIn, const EuchreCoreMarkov& core, std::string i) :
	taken(rIn, i + "_taken", core.config.h - 1),
	score(rIn, i + "_score", core.config.winningPoints - 1)
{}

RIn::PlayerFeatures::PlayerFeatures(RIn& rIn, const EuchreCoreMarkov& core, std::string i) :
	showedOuts(rIn, i + "_showed_outs", rIn.trump),
	cardsPlayed(rIn, i + "_cards_played", core.deck->lowCard, rIn.trump)
{}

// wIn

//WIn::WIn(const EuchreCoreMarkov& core) {
//	for (int i = 0; i < core.config.N / 2; i++) {
//		teamFeatures.push_back(std::make_unique<TeamFeatures>(*this, core, std::to_string(i)));
//	}
//}
//
//WIn::TeamFeatures::TeamFeatures(WIn& wIn, const EuchreCoreMarkov& core, std::string i) :
//	score(wIn, i + "_score", core.config.winningPoints - 1)
//{}

WIn::WIn(const EuchreCoreMarkov& core) : scores(*this, "scores", (int)pow(core.config.winningPoints, core.config.N / 2) - 1) {}

// core and undo

void EuchreCoreMarkov::initialize() {
	EuchreCore::initialize();
	emptyTIn = std::make_shared<TIn>(*this, 0);
	emptyPIn = std::make_shared<PIn>(*this, 0);
	emptyRIn = std::make_shared<RIn>(*this, 0, 0);
	emptyWIn = std::make_shared<WIn>(*this);
}

std::shared_ptr<EuchrePlayer> EuchreCoreMarkov::createPlayer(int index) {
	return std::make_shared<EuchrePlayerMarkov>(this, index);
}

void EuchreCoreMarkov::dealSetup() {
	EuchreCore::dealSetup();

	initializeWIn();
	wInCache.push_back(wIn);
}

void EuchreCoreMarkov::chooseTrumpSetup() {
	EuchreCore::chooseTrumpSetup();

	int indexOffset = config.N - leader;

	// tIn initialization
	tIns.clear();
	for (auto& owner : players) {
		std::shared_ptr<TIn> tIn = std::make_shared<TIn>(*this, upCard.suit);
		tIns.push_back(tIn);

		// don't change
		tIn->me.set((owner->index + indexOffset) % config.N);
		tIn->upCard.set(&upCard);
		for (int i = 0; i < config.N / 2; i++) {
			auto& tFeatures = tIn->teamFeatures[(i + indexOffset) % (config.N / 2)];
			tFeatures->score.set(scores[i]);
		}
		tIn->myHand.set(owner->hand);
		tIn->phase.set(1);
		tIn->turn.set(0);
	}

	// trump rIn initialization
	trumpRIns.clear();
	for (auto& owner : players) {
		trumpRIns.emplace_back();
		auto& playerRIns = trumpRIns.back();
		for (int trump = 0; trump < 4; trump++) {
			std::shared_ptr<RIn> rIn = std::make_shared<RIn>(*this, trump, leader);
			playerRIns.push_back(rIn);

			// don't change
			rIn->me.set((owner->index + indexOffset) % config.N);
			rIn->upCard.set(&upCard);
			for (int i = 0; i < config.N / 2; i++) {
				auto& tFeatures = rIn->teamFeatures[(i + indexOffset) % (config.N / 2)];
				tFeatures->score.set(scores[i]);
			}
			rIn->myHand.set(owner->hand);
			rIn->dealer.set((roundNumber + indexOffset) % config.N);
		}
	}
}

void EuchreCoreMarkov::trumpChoiceApplied(int index, TrumpChoice& choice) {
	EuchreCore::trumpChoiceApplied(index, choice);

	std::shared_ptr<std::vector<double>> out = std::make_shared<std::vector<double>>(
		std::vector<double>{ 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 }
	);
	int i = 0;
	if (!choice.pass) {
		i = 1 + 2 * ((choice.suit + 4 - upCard.suit) % 4);
		if (choice.alone) {
			i++;
		}
	}
	(*out)[i] = 1.0;

	for (auto& owner : players) {
		auto inCopy = std::make_shared<SparseVector>(SparseVector{ *tIns[owner->index] });
		tData.emplace_back(inCopy, out);
		applyTrumpChoiceForPlayerTIn(owner, index, choice);
	}
}

std::shared_ptr<EuchreCoreMarkov::Undo> EuchreCoreMarkov::applyTrumpChoiceHypo(std::shared_ptr<EuchrePlayer> owner, int index, TrumpChoice& choice) {
	std::shared_ptr<EuchreCoreMarkov::Undo> undo = std::make_shared<EuchreCoreMarkov::UnapplyTrumpChoice>(*this, owner, choice, trumpPhase);

	EuchreCore::applyTrumpChoice(index, choice);
	applyTrumpChoiceForPlayerTIn(owner, index, choice);

	return undo;
}

void EuchreCoreMarkov::applyTrumpChoiceForPlayerTIn(std::shared_ptr<EuchrePlayer> owner, int index, TrumpChoice& choice) {
	auto& tIn = tIns[owner->index];

	if (trumpPhase == EuchreTrumpPhase::DOWN) {
		tIn->phase.set(2);
	}
	tIn->turn.set(trumpIndex);

	if (trumpPhase == EuchreTrumpPhase::DECLARED) {
		auto& rIn = trumpRIns[owner->index][trump];
		rIn->declarer.set((declarer + config.N - leader) % config.N);
		rIn->alone.set(alone ? 1 : 0);
	}
}

void EuchreCoreMarkov::UnapplyTrumpChoice::undo() {
	if (choice.pass) {
		core.trumpIndex = (core.trumpIndex + core.config.N - 1) % core.config.N;
	}
	if (core.trumpPhase != prevTrumpPhase) {
		core.deck->unplayCard(core.upCard);
		core.trumpPhase = prevTrumpPhase;
	}
	core.trump = -1;
	core.alone = false;
	core.declarer = -1;
	core.orderedUp = false;
	core.sittingOut = -1;
	core.leader = (core.roundNumber + 1) % core.config.N;

	auto& tIn = core.tIns[owner->index];
	if (prevTrumpPhase == EuchreTrumpPhase::UP) {
		tIn->phase.set(1);
	}
	tIn->turn.set(core.trumpIndex);
}

void EuchreCoreMarkov::playSetup() {
	for (auto& player : players) {
		dynamic_cast<EuchrePlayerMarkov&>(*player).cardsPlayed.clear();
	}
	EuchreCore::playSetup();
}

void EuchreCoreMarkov::trickSetup() {
	EuchreCore::trickSetup();

	int indexOffset = config.N - leader;

	// pIn initialization
	pIns.clear();
	for (auto& owner : players) {
		std::shared_ptr<PIn> pIn = std::make_shared<PIn>(*this, trump);
		pIns.push_back(pIn);

		// don't change
		pIn->me.set((owner->index + indexOffset) % config.N);
		pIn->upCard.set(&upCard);
		pIn->declarer.set((declarer + indexOffset) % config.N);
		pIn->alone.set(alone ? 1 : 0);
		pIn->dealer.set((roundNumber + indexOffset) % config.N);
		for (int i = 0; i < config.N / 2; i++) {
			auto& tFeatures = pIn->teamFeatures[(i + indexOffset) % (config.N / 2)];
			tFeatures->taken.set(players[i]->taken + players[i + config.N / 2]->taken);
			tFeatures->score.set(scores[i]);
		}

		// may change
		pIn->myHand.set(owner->hand);
		for (auto& player : players) {
			auto& pFeatures = pIn->playerFeatures[(player->index + indexOffset) % config.N];
			for (int i = 0; i < 4; i++) {
				pFeatures->showedOuts.set(i, player->showedOut[i]);
			}
			pFeatures->cardsPlayed.set(dynamic_cast<EuchrePlayerMarkov&>(*player).cardsPlayed);
		}
	}

	// play rIn initialization
	playRIns.clear();
	for (auto& owner : players) {
		playRIns.emplace_back();
		auto& playerRIns = playRIns.back();
		for (int l = 0; l < config.N; l++) {
			int indexOffset = config.N - l;

			std::shared_ptr<RIn> rIn = std::make_shared<RIn>(*this, trump, l);
			playerRIns.push_back(rIn);

			// don't change
			rIn->me.set((owner->index + indexOffset) % config.N);
			rIn->upCard.set(&upCard);
			rIn->declarer.set((declarer + indexOffset) % config.N);
			rIn->alone.set(alone ? 1 : 0);
			rIn->dealer.set((roundNumber + indexOffset) % config.N);
			for (int i = 0; i < config.N / 2; i++) {
				auto& tFeatures = rIn->teamFeatures[(i + indexOffset) % (config.N / 2)];
				tFeatures->score.set(scores[i]);
			}

			// may change
			rIn->myHand.set(owner->hand);
			for (auto& player : players) {
				auto& pFeatures = rIn->playerFeatures[(player->index + indexOffset) % config.N];
				for (int i = 0; i < 4; i++) {
					pFeatures->showedOuts.set(i, player->showedOut[i]);
				}
				pFeatures->cardsPlayed.set(dynamic_cast<EuchrePlayerMarkov&>(*player).cardsPlayed);
			}
			for (int i = 0; i < config.N / 2; i++) {
				auto& tFeatures = rIn->teamFeatures[(i + indexOffset) % (config.N / 2)];
				tFeatures->taken.set(players[i]->taken + players[i + config.N / 2]->taken);
			}
		}

		rInCache.push_back(std::make_shared<SparseVector>(SparseVector{ *playerRIns[leader] }));
	}
}

void EuchreCoreMarkov::cardPlayed(int index, const Card& card) {
	std::shared_ptr<EuchrePlayer> player = players[index];
	dynamic_cast<EuchrePlayerMarkov&>(*player).cardsPlayed.push_back(card.code);

	std::shared_ptr<std::vector<double>> out = std::make_shared<std::vector<double>>();
	for (int i = 0; i < 4 * (13 - deck->lowCard); i++) {
		out->push_back(0.0);
	}
	int i = adjustedCode(card.code, trump, deck->lowCard);
	(*out)[i] = 1.0;

	for (auto& owner : players) {
		auto inCopy = std::make_shared<SparseVector>(SparseVector{ *pIns[owner->index] });
		pData.emplace_back(inCopy, out);
		playCardForPlayerPIn(owner, player, card, leader);
	}

	EuchreCore::cardPlayed(index, card);
}

std::shared_ptr<EuchreCoreMarkov::Undo> EuchreCoreMarkov::playCardHypo(std::shared_ptr<EuchrePlayer> owner, std::shared_ptr<EuchrePlayer> player, const Card& card, int lastIndex) {
	std::shared_ptr<EuchreCoreMarkov::Undo> undo = std::make_shared<EuchreCoreMarkov::UnplayCard>(*this, owner, player, card);

	int prevLeader = leader;
	EuchreCore::playCard(player->index, card);
	playCardForPlayerPIn(owner, player, card, prevLeader);
	if (player->index == lastIndex) {
		evaluateTrickForPlayerRIn(owner);
	}

	return undo;
}

void EuchreCoreMarkov::playCardForPlayerPIn(std::shared_ptr<EuchrePlayer> owner, std::shared_ptr<EuchrePlayer> player, const Card& card, int prevLeader) {
	auto& pIn = pIns[owner->index];

	if (owner->index == player->index) {
		pIn->myHand.remove(card);
	}

	int indexOffset = config.N - prevLeader;
	auto& pFeatures = pIn->playerFeatures[(player->index + indexOffset) % config.N];
	pFeatures->trick.set(&card);
	if (follow != -1) {
		pFeatures->showedOuts.set(follow, player->showedOut[follow]);
	}
	pFeatures->cardsPlayed.add(card);

	for (int l = 0; l < config.N; l++) {
		auto& rIn = playRIns[owner->index][l];

		if (owner->index == player->index) {
			rIn->myHand.remove(card);
		}

		int indexOffset = config.N - l;
		auto& pFeatures = rIn->playerFeatures[(player->index + indexOffset) % config.N];
		if (follow != -1) {
			pFeatures->showedOuts.set(follow, player->showedOut[follow]);
		}
		pFeatures->cardsPlayed.add(card);
	}
}

EuchreCoreMarkov::UnplayCard::UnplayCard(EuchreCoreMarkov& core, std::shared_ptr<EuchrePlayer> owner, std::shared_ptr<EuchrePlayer> player, const Card& card)
	: Undo(core), owner(owner), player(player), card(card), prevFollow(core.follow), prevShowedOut(prevFollow != -1 ? player->showedOut[prevFollow] : false), 
	prevPlayIndex(core.playIndex), prevTrickWinner(core.currentTrickWinner)
{
	next = std::make_shared<EuchreCoreMarkov::UnevaluateTrick>(core, owner);
}

void EuchreCoreMarkov::UnplayCard::undo() {
	// base core
	core.currentTrickWinner = prevTrickWinner;
	core.playIndex = prevPlayIndex;
	core.follow = prevFollow;
	if (prevFollow != -1) {
		player->showedOut[prevFollow] = prevShowedOut;
	}

	core.deck->unplayCard(card);

	// pIn
	auto& pIn = core.pIns[owner->index];

	if (owner->index == player->index) {
		pIn->myHand.add(card);
	}

	int indexOffset = core.config.N - core.leader;
	auto& pFeatures = pIn->playerFeatures[(player->index + indexOffset) % core.config.N];
	pFeatures->trick.set(nullptr);
	if (prevFollow != -1) {
		pFeatures->showedOuts.set(prevFollow, prevShowedOut);
	}
	pFeatures->cardsPlayed.remove(card);

	// rIn
	for (int l = 0; l < core.config.N; l++) {
		auto& rIn = core.playRIns[owner->index][l];

		if (owner->index == player->index) {
			rIn->myHand.add(card);
		}

		int indexOffset = core.config.N - l;
		auto& pFeatures = rIn->playerFeatures[(player->index + indexOffset) % core.config.N];
		if (prevFollow != -1) {
			pFeatures->showedOuts.set(prevFollow, prevShowedOut);
		}
		pFeatures->cardsPlayed.remove(card);
	}
}

void EuchreCoreMarkov::evaluateTrickForPlayerRIn(std::shared_ptr<EuchrePlayer> owner) {
	auto& rIn = playRIns[owner->index][leader];
	int taken = players[leader]->taken + players[(leader + config.N / 2) % config.N]->taken;
	rIn->teamFeatures[0]->taken.set(taken);
}

EuchreCoreMarkov::UnevaluateTrick::UnevaluateTrick(EuchreCoreMarkov& core, std::shared_ptr<EuchrePlayer> owner) : Undo(core), owner(owner), prevLeader(core.leader) {
	next = std::make_shared<EuchreCoreMarkov::Unscore>(core);
}

void EuchreCoreMarkov::UnevaluateTrick::undo() {
	if (core.playIndex < core.config.N) {
		return;
	}

	int newLeader = core.leader;

	core.players[newLeader]->taken--;
	core.trickIndex--;
	core.leader = prevLeader;

	// rIn
	auto& rIn = core.playRIns[owner->index][newLeader];
	int taken = core.players[newLeader]->taken + core.players[(newLeader + core.config.N / 2) % core.config.N]->taken;
	rIn->teamFeatures[0]->taken.set(taken);
}

std::shared_ptr<EuchreCoreMarkov::Undo> EuchreCoreMarkov::scoreHypo(EuchreRoundResult roundResult) {
	std::shared_ptr<EuchreCoreMarkov::Undo> undo = std::make_shared<EuchreCoreMarkov::Unscore>(*this);

	this->roundResult = roundResult;
	EuchreCore::score();

	return undo;
}

void EuchreCoreMarkov::Unscore::undo() {
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

void EuchreCoreMarkov::scored() {
	EuchreCore::scored();

	std::shared_ptr<std::vector<double>> out = std::make_shared<std::vector<double>>(
		std::vector<double>{ 0.0, 0.0, 0.0 }
	);
	(*out)[(int)roundResult] = 1.0;
	for (auto& rIn : rInCache) {
		rData.emplace_back(rIn, out);
	}
	rInCache.clear();

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

void EuchreCoreMarkov::initializeWIn() {
	//wIn = std::make_shared<WIn>(*this);
	//for (int i = 0; i < config.N / 2; i++) {
	//	wIn->teamFeatures[i]->score.set(scores[(i + roundNumber + 1) % (config.N / 2)]);
	//}

	wIn = std::make_shared<WIn>(*this);
	int code = 0;
	for (int i = 0; i < config.N / 2; i++) {
		code = config.winningPoints * code + scores[(i + roundNumber + 1) % (config.N / 2)];
	}
	wIn->scores.set(code);
}

std::shared_ptr<std::vector<double>> EuchreCoreMarkov::getWOut() {
	int code = 0;
	for (int i = 0; i < config.N / 2; i++) {
		code = config.winningPoints * code + scores[(i + roundNumber + 1) % (config.N / 2)];
	}

	auto& memo = wOutMemo[code];
	if (memo == nullptr) {
		initializeWIn();
		memo = wModel(*wIn);
	}
	return memo;
}

void EuchreCoreMarkov::clearData() {
	tData.clear();
	pData.clear();
	rData.clear();
	wData.clear();
}

void EuchreCoreMarkov::logDebugDetails() {
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

void EuchrePlayerMarkov::chooseTrump(int phase, bool stuck) {
	TrumpDecision decision(*this);

	double x = roll();
	if (x > greed) {
		readiedTrumpChoice = dynamic_cast<TrumpDiff&>(*decision.random(core->rng)).trumpChoice;
	}
	else {
		readiedTrumpChoice = dynamic_cast<TrumpDiff&>(*decision.best()).trumpChoice;
	}
}

void EuchrePlayerMarkov::pickItUp() {
	DiscardDecision decision(*this);

	double x = roll();
	if (x > greed) {
		readiedDiscard = dynamic_cast<DiscardDiff&>(*decision.random(core->rng)).card;
	}
	else {
		readiedDiscard = dynamic_cast<DiscardDiff&>(*decision.best()).card;
	}
}

void EuchrePlayerMarkov::play(std::vector<const Card*>& canPlay) {
	if (canPlay.size() == 1) {
		readiedPlay = *canPlay[0];
	}
	else {
		PlayDecision decision(*this, canPlay);

		double x = roll();
		if (x > greed) {
			readiedPlay = dynamic_cast<PlayDiff&>(*decision.random(core->rng)).card;
		}
		else {
			readiedPlay = dynamic_cast<PlayDiff&>(*decision.best()).card;
		}
	}
}

const Card& EuchrePlayerMarkov::chooseRandomCard() {
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

std::vector<std::shared_ptr<Diff>> TrumpDecision::children() {
	std::vector<std::shared_ptr<Diff>> ans;
	EuchreCore& core = *player.core;

	if (!core.dealerStuck) {
		ans.push_back(std::make_shared<TrumpDiff>(player, player.index, -1, false, 1.0));
	}

	if (core.trumpPhase == EuchreTrumpPhase::UP) {
		ans.push_back(std::make_shared<TrumpDiff>(player, player.index, core.upCard.suit, false, 1.0));
		ans.push_back(std::make_shared<TrumpDiff>(player, player.index, core.upCard.suit, true, 1.0));
	}
	else if (core.trumpPhase == EuchreTrumpPhase::DOWN) {
		for (int suit = 0; suit < 4; suit++) {
			if (suit != core.upCard.suit) {
				ans.push_back(std::make_shared<TrumpDiff>(player, player.index, suit, false, 1.0));
				ans.push_back(std::make_shared<TrumpDiff>(player, player.index, suit, true, 1.0));
			}
		}
	}

	return ans;
}

std::vector<std::shared_ptr<Diff>> TrumpDiff::children() {
	std::vector<std::shared_ptr<Diff>> ans;
	EuchreCoreMarkov& core = *this->core();

	if (core.trumpPhase == EuchreTrumpPhase::DECLARED) {
		if (core.trump == core.upCard.suit && index == player.index && index == core.roundNumber % core.config.N) {
			// Decide our discard
			DiscardDecision nextDecision(player);
			if (logging()) {
				log->openDict("subDecision");
			}
			std::shared_ptr<Diff> best = nextDecision.best();
			if (logging()) {
				log->close();
			}
			ans.push_back(std::make_shared<WinDiff>(player, best->cachedE));
		}
		else {
			std::shared_ptr<std::vector<double>> probs = core.rModel(*core.trumpRIns[player.index][core.trump]);

			ans.push_back(std::make_shared<RoundResultDiff>(player, EuchreRoundResult::EUCHRED, (*probs)[0]));
			ans.push_back(std::make_shared<RoundResultDiff>(player, EuchreRoundResult::MADE, (*probs)[1]));
			ans.push_back(std::make_shared<RoundResultDiff>(player, EuchreRoundResult::MADE_ALL, (*probs)[2]));
		}
	}
	else if (core.trumpPhase == EuchreTrumpPhase::PASSED) {
		// TODO
		std::cerr << "implement passed out" << std::endl;
		exit(1);
		double q = (double)(player.core->rng() % 1000) / 1000;
		ans.push_back(std::make_shared<WinDiff>(player, q));
	}
	else {
		int nextIndex = (index + 1) % core.config.N;

		if (nextIndex == player.index) {
			// Decide our next trump choice
			TrumpDecision nextDecision(player);
			if (logging()) {
				log->openDict("subDecision");
			}
			std::shared_ptr<Diff> best = nextDecision.best();
			if (logging()) {
				log->close();
			}
			ans.push_back(std::make_shared<WinDiff>(player, best->cachedE));
		}
		else {
			std::shared_ptr<std::vector<double>> probs = core.tModel(*core.tIns[player.index]);

			if (!core.dealerStuck) {
				ans.push_back(std::make_shared<TrumpDiff>(player, nextIndex, -1, false, (*probs)[0]));
			}

			if (core.trumpPhase == EuchreTrumpPhase::UP) {
				ans.push_back(std::make_shared<TrumpDiff>(player, nextIndex, core.upCard.suit, false, (*probs)[1]));
				ans.push_back(std::make_shared<TrumpDiff>(player, nextIndex, core.upCard.suit, true, (*probs)[2]));
			}
			else if (core.trumpPhase == EuchreTrumpPhase::DOWN) {
				for (int suit = 0; suit < 4; suit++) {
					if (suit != core.upCard.suit) {
						int rotated = 1 + 2 * ((suit + 4 - core.upCard.suit) % 4);
						ans.push_back(std::make_shared<TrumpDiff>(player, nextIndex, suit, false, (*probs)[rotated]));
						ans.push_back(std::make_shared<TrumpDiff>(player, nextIndex, suit, true, (*probs)[rotated + 1]));
					}
				}
			}
		}
	}

	return ans;
}

void TrumpDiff::apply() {
	undoRoot = core()->applyTrumpChoiceHypo(std::make_shared<EuchrePlayer>(player), index, trumpChoice);
}

void TrumpDiff::undo() {
	if (undoRoot != nullptr) {
		undoRoot->undoAll();
	}
}

int TrumpDiff::weight() {
	if (trumpChoice.pass) {
		return 9057;
	}
	if (trumpChoice.alone) {
		return 188;
	}
	return 755;
}

std::string TrumpDiff::name() {
	std::stringstream ss;

	ss << index << "," << trumpChoice.toString();

	return ss.str();
}

void TrumpDiff::logExtraDetails() {
	int turn = (player.core->trumpIndex + player.core->leader) % player.core->config.N;
	if (trumpChoice.pass && turn != player.index) {
		log->openDict("tIn");
		core()->tIns[player.index]->log(*log);
		log->close();
	}
	else if (!trumpChoice.pass) {
		log->openDict("rIn");
		core()->trumpRIns[player.index][core()->trump]->log(*log);
		log->close();
	}
}

// discard decision

std::vector<std::shared_ptr<Diff>> DiscardDecision::children() {
	std::vector<std::shared_ptr<Diff>> ans;
	for (const Card& card : player.hand) {
		ans.push_back(std::make_shared<DiscardDiff>(player, card));
	}
	ans.push_back(std::make_shared<DiscardDiff>(player, player.core->upCard));
	return ans;
}

std::vector<std::shared_ptr<Diff>> DiscardDiff::children() {
	EuchreCoreMarkov& core = *this->core();

	std::vector<std::shared_ptr<Diff>> ans;

	std::shared_ptr<std::vector<double>> probs = core.rModel(*core.trumpRIns[player.index][core.trump]);

	ans.push_back(std::make_shared<RoundResultDiff>(player, EuchreRoundResult::EUCHRED, (*probs)[0]));
	ans.push_back(std::make_shared<RoundResultDiff>(player, EuchreRoundResult::MADE, (*probs)[1]));
	ans.push_back(std::make_shared<RoundResultDiff>(player, EuchreRoundResult::MADE_ALL, (*probs)[2]));

	return ans;
}

void DiscardDiff::apply() {}

void DiscardDiff::undo() {}

std::string DiscardDiff::name() {
	return card.toString();
}

void DiscardDiff::logExtraDetails() {
	log->openDict("rIn");
	core()->trumpRIns[player.index][core()->trump]->log(*log);
	log->close();
}

// play decision

std::vector<std::shared_ptr<Diff>> PlayDecision::children() {
	std::vector<std::shared_ptr<Diff>> ans;
	int lastIndex = (player.core->leader + player.core->config.N - 1) % player.core->config.N;
	if (lastIndex == player.core->sittingOut) {
		lastIndex = (lastIndex + player.core->config.N - 1) % player.core->config.N;
	}
	for (const Card* card : canPlay) {
		ans.push_back(std::make_shared<PlayDiff>(player, player.index, *card, lastIndex, 1.0));
	}
	return ans;
}

std::vector<std::shared_ptr<Diff>> PlayDiff::children() {
	EuchreCoreMarkov& core = *this->core();

	std::vector<std::shared_ptr<Diff>> ans;
	if (index == lastIndex) {
		if (core.roundResult == EuchreRoundResult::UNFINISHED) {
			int N = core.config.N;
			int h = core.config.h;
			int declarer = core.declarer;
			int partner = (declarer + N / 2) % N;
			int taken = core.players[declarer]->taken + core.players[partner]->taken;
			int lost = core.trickIndex - taken;

			std::shared_ptr<std::vector<double>> probs = core.rModel(*core.playRIns[player.index][core.leader]);

			if (taken <= h / 2) {
				ans.push_back(std::make_shared<RoundResultDiff>(player, EuchreRoundResult::EUCHRED, (*probs)[0]));
			}
			ans.push_back(std::make_shared<RoundResultDiff>(player, EuchreRoundResult::MADE, (*probs)[1]));
			if (lost == 0) {
				ans.push_back(std::make_shared<RoundResultDiff>(player, EuchreRoundResult::MADE_ALL, (*probs)[2]));
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
				//std::shared_ptr<std::vector<double>> probs = core.wModel(*core.wIn);
				std::shared_ptr<std::vector<double>> probs = core.getWOut();
				q = (*probs)[(player.index + core.roundNumber + 1) % (core.config.N / 2)];
			}
			ans.push_back(std::make_shared<WinDiff>(player, q));
		}
	}
	else {
		std::shared_ptr<std::vector<double>> probs = core.pModel(*core.pIns[player.index]);

		int nextIndex = (index + 1) % core.config.N;
		if (nextIndex == core.sittingOut) {
			nextIndex = (nextIndex + 1) % core.config.N;
		}
		for (const Card& card2 : core.deck->cardsNotPlayed) {
			if (player.hand.count(card2) > 0) {
				continue;
			}
			if (core.players[nextIndex]->showedOut[card2.suit]) {
				continue;
			}
			if (card2.code == core.upCard.code && nextIndex != core.roundNumber % core.config.N) {
				continue;
			}
			int code = adjustedCode(card2.code, core.trump, core.config.lowCard);
			ans.push_back(std::make_shared<PlayDiff>(player, nextIndex, card2, lastIndex, (*probs)[code]));
		}
		//applySoftMax(ans);
	}
	return ans;
}

void PlayDiff::logExtraDetails() {
	//core()->logDebugDetails();
	if (index != lastIndex) {
		log->openDict("pIn");
		core()->pIns[player.index]->log(*log);
		log->close();
	}
	else if (core()->roundResult == EuchreRoundResult::UNFINISHED) {
		log->openDict("rIn");
		core()->playRIns[player.index][core()->leader]->log(*log);
		log->close();
	}
	else if (!core()->gameOver) {
		core()->initializeWIn();
		log->openDict("wIn");
		core()->wIn->log(*log);
		log->close();
	}
}

void PlayDiff::apply() {
	undoRoot = core()->playCardHypo(std::make_shared<EuchrePlayer>(player), core()->players[index], card, lastIndex);
}

void PlayDiff::undo() {
	if (undoRoot != nullptr) {
		undoRoot->undoAll();
	}
}

std::string PlayDiff::name() {
	std::stringstream ss;

	ss << index << "," << card.toString();

	return ss.str();
}

// terminal diffs

std::vector<std::shared_ptr<Diff>> RoundResultDiff::children() {
	EuchreCoreMarkov& core = *this->core();

	std::vector<std::shared_ptr<Diff>> ans;
	double q = 0;
	if (core.gameOver) {
		if (player.didIWin()) {
			q = 1;
		}
	}
	else {
		//std::shared_ptr<std::vector<double>> probs = core.wModel(*core.wIn);
		std::shared_ptr<std::vector<double>> probs = core.getWOut();
		q = (*probs)[(player.index + core.roundNumber + 1) % (core.config.N / 2)];
	}
	ans.push_back(std::make_shared<WinDiff>(player, q));
	return ans;
}

void RoundResultDiff::logExtraDetails() {
	//core()->logDebugDetails();
	core()->initializeWIn();
	log->openDict("wIn");
	core()->wIn->log(*log);
	log->close();
}

void RoundResultDiff::apply() {
	undoRoot = core()->scoreHypo(roundResult);
}

void RoundResultDiff::undo() {
	if (undoRoot != nullptr) {
		undoRoot->undoAll();
	}
}

std::string RoundResultDiff::name() {
	switch (roundResult) {
	case EUCHRED:
		return "euchred";
	case MADE:
		return "made";
	case MADE_ALL:
		return "madeAll";
	default:
		return "";
	}
}
