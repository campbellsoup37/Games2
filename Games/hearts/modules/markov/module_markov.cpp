#include <math.h>

#include "hearts/core.h"
#include "module_markov.h"

// ML

void FeatureCard::log(Log& logger) {
	if (logger.logging) {
		logger.openFlatDict(name);
		logger.write("d", d);
		logger.write("offset", offset);
		logger.write("card", value == -1 ? "" : Card(value).toString());
		if (position >= 0) {
			logger.write("index", vec.indices[position][1]);
		}
		logger.close();
	}
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

void FeatureHand::log(Log& logger) {
	if (logger.logging) {
		logger.openFlatDict(name);
		logger.write("d", d);
		logger.write("offset", offset);
		logger.openFlatList("cards");
		for (int i = 0; i < 52; i++) {
			if (values[i] == 1.0) {
				logger.write(Card(i).toString());
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

// Module

void HeartsAiModuleMarkov::pass() {
	qIn = std::make_shared<QIn>(*core, negativeScoreTolerance);
	loadQIn();

	player->readiedPass.clear();

	PassDecision decision(*this);

	double roll = (double)core->rng() / core->rng.max();
	if (roll > greed) {
		std::vector<int> cards = dynamic_cast<PassDiff&>(*decision.random(core->rng)).cards;

		for (int code : cards) {
			player->readiedPass.emplace_back(code);
		}
	}
	else {
		std::vector<int> cards = dynamic_cast<PassDiff&>(*decision.best()).cards;

		for (int code : cards) {
			player->readiedPass.emplace_back(code);
		}
	}
}

void HeartsAiModuleMarkov::play(std::vector<const Card*>& canPlay) {
	pIn = std::make_shared<PIn>(*core, negativeScoreTolerance);
	qIn = std::make_shared<QIn>(*core, negativeScoreTolerance);
	areInsStale = false;
	loadPIn();
	loadQIn();

	if (canPlay.size() == 1) {
		player->readiedPlay = *canPlay[0];
	}
	else {
		PlayDecision decision(*this, canPlay);

		double roll = (double)core->rng() / core->rng.max();
		if (roll > greed) {
			player->readiedPlay = dynamic_cast<PlayDiff&>(*decision.random(core->rng)).card;
		}
		else {
			player->readiedPlay = dynamic_cast<PlayDiff&>(*decision.best()).card;
		}
	}
}

void HeartsAiModuleMarkov::shoot() {
	player->readiedShoot = ShootChoice::GO_DOWN;
}

void HeartsAiModuleMarkov::notifyGameStart() {
	pPairs.clear();
	qPairs.clear();
}

void HeartsAiModuleMarkov::notifyPass() {
	std::vector<int> cards;
	for (const Card& card : player->readiedPass) {
		cards.push_back(card.code);
	}

	PassDiff diff(*this, cards);
	diff.evolveQIn();
	qPairs.emplace_back(qIn, std::make_shared<std::vector<double>>());
}

void HeartsAiModuleMarkov::notifyPlay(int index) {
	if (areInsStale) {
		// For whatever reason, we didn't calculate ins. E.g., when index played before me.
		return;
	}

	int lastIndex = (core->leader + core->config.N - 1) % core->config.N;
	const Card& card = core->players[index].trick;

	std::shared_ptr<std::vector<double>> pOut = std::make_shared<std::vector<double>>();
	for (int i = 0; i < 52; i++) {
		pOut->push_back((double)(i == card.code));
	}
	pPairs.emplace_back(pIn, pOut);

	PlayDiff diff(*this, index, card, lastIndex, 1.0);
	diff.evolvePIn();
	diff.evolveQIn();

	if (index == lastIndex) {
		areInsStale = true;
		qPairs.emplace_back(qIn, std::make_shared<std::vector<double>>());
	}

	if (core->gameOver) {
		double q = (double)isMyScoreTheBest();
		for (InOutPair& pair : qPairs) {
			pair.out->push_back(q);
		}
	}
}

void HeartsAiModuleMarkov::loadPIn() {
	int N = core->config.N;
	int myI = (player->index - core->leader + N) % N;

	// Features that don't change with the tree
	pIn->me.set(myI);
	pIn->passOffset.set(core->roundNumber % N);
	pIn->myPass.set(player->cardsPassed);
	pIn->passedToMe.set(player->cardsReceived);
	
	for (int i = 0; i < N; i++) {
		int j = (core->leader + i) % N;
		HeartsPlayer& player = core->players[j];
		PIn::PlayerFeatures& features = *pIn->playerFeatures[i];

		features.cardsPlayed.set(player.cardsPlayed, i < myI ? player.trick.code : -1);
		features.points.set(player.points);
		features.score.set(std::max(player.score, negativeScoreTolerance - 1));
		features.passed.set((int)(player.cardsPassed.size() != 0));
	}

	// Features that do change

	pIn->myHand.set(player->hand);
	pIn->turn.set((player->index - core->leader + N) % N);
	
	for (int i = 0; i < N; i++) {
		int j = (core->leader + i) % N;
		HeartsPlayer& player = core->players[j];
		PIn::PlayerFeatures& features = *pIn->playerFeatures[i];

		for (int suit = 0; suit < 4; suit++) {
			features.showedOuts.set(suit, (double)player.showedOut[suit]);
		}
		features.trick.set(i < myI ? &player.trick : nullptr);
	}
}

void HeartsAiModuleMarkov::loadQIn() {
	int N = core->config.N;

	bool roundEnd = false;
	int state = 0;
	int leaderI = -1;

	if (core->state == HeartsCoreState::PASSING) {
		state = 2;
		if (player->hand.count(Card(core->leadCode)) > 0) {
			leaderI = 0;
		}
	}
	else if (core->state == HeartsCoreState::PLAYING) {
		roundEnd = core->trickIndex == core->trickCount - 1;
		state = (int)roundEnd;
		if (!roundEnd) {
			leaderI = (core->leader - player->index + N) % N;
		}
	}

	int roundNumber = core->roundNumber + (roundEnd ? 1 : 0);

	qIn->state.set(state);
	qIn->passOffset.set(roundNumber % N);
	qIn->leader.set(leaderI);

	if (roundEnd) {
		return;
	}

	qIn->myHand.set(player->hand);
	for (int i = 0; i < N; i++) {
		int j = (player->index + i) % N;
		HeartsPlayer& player = core->players[j];

		qIn->playerFeatures[i]->score.set(std::max(player.score, negativeScoreTolerance - 1));
	}

	if (core->state == HeartsCoreState::PASSING) {
		return;
	}

	qIn->myPass.set(player->cardsPassed);
	qIn->passedToMe.set(player->cardsReceived);

	for (int i = 0; i < N; i++) {
		int j = (player->index + i) % N;
		HeartsPlayer& player = core->players[j];

		qIn->playerFeatures[i]->passed.set((int)(player.cardsPassed.size() != 0));
	}

	for (int i = 0; i < N; i++) {
		int j = (player->index + i) % N;
		HeartsPlayer& player = core->players[j];
		QIn::PlayerFeatures& features = *qIn->playerFeatures[i];

		features.points.set(player.points);
		for (int suit = 0; suit < 4; suit++) {
			features.showedOuts.set(suit, (double)player.showedOut[suit]);
		}
		features.cardsPlayed.set(player.cardsPlayed, i >= leaderI ? player.trick.code : -1);
	}
}

int HeartsAiModuleMarkov::getPInSize() {
	return PIn(*core, negativeScoreTolerance).size();
}

int HeartsAiModuleMarkov::getQInSize() {
	return QIn(*core, negativeScoreTolerance).size();
}

// Diffs

void cardCombinations(const std::vector<int>& hand, std::vector<std::vector<int>>& ans, int count, int index) {
	if (count == 0) {
		ans.emplace_back();
		return;
	}

	if (index >= hand.size()) {
		return;
	}

	std::vector<std::vector<int>> sub;
	cardCombinations(hand, sub, count - 1, index + 1);

	for (const std::vector<int>& choice : sub) {
		ans.emplace_back();
		std::vector<int>& newChoice = ans.back();
		newChoice.push_back(hand[index]);
		newChoice.insert(newChoice.end(), choice.begin(), choice.end());
	}

	cardCombinations(hand, ans, count, index + 1);
}

std::vector<std::shared_ptr<Diff>> PassDecision::children() {
	std::vector<std::shared_ptr<Diff>> ans;

	std::vector<int> hand;
	for (const Card& card : module.player->hand) {
		hand.push_back(card.code);
	}

	std::vector<std::vector<int>> choices;
	cardCombinations(hand, choices, module.core->passSize, 0);

	for (std::vector<int>& choice : choices) {
		ans.push_back(std::make_shared<PassDiff>(module, choice));
	}

	if (module.core->config.oregon) {
		ans.push_back(std::make_shared<PassDiff>(module, std::vector<int>()));
	}

	return ans;
}

std::vector<std::shared_ptr<Diff>> PassDiff::children() {
	std::vector<std::shared_ptr<Diff>> ans;

	const std::vector<double>& qOut = module.qModel(*module.qIn);
	ans.push_back(std::make_shared<WinDiff>(module, qOut[0]));

	return ans;
}

void PassDiff::apply() {
	prevLeader = module.qIn->leader.get();

	evolveQIn();
}

void PassDiff::evolveQIn() {
	if (cards.empty()) {
		// Oregon no pass
		return;
	}

	QIn& qIn = *module.qIn;

	for (int code : cards) {
		qIn.myHand.remove(code);
		qIn.myPass.add(code);

		if (code == module.core->leadCode) {
			int N = module.core->config.N;
			int newLeader = (module.core->passOffset + N) % N;
			qIn.leader.set(newLeader);
		}
	}
	qIn.playerFeatures[0]->passed.set(1);
}

void PassDiff::undo() {
	devolveQIn(prevLeader);
}

void PassDiff::devolveQIn(int leaderMemo) {
	if (cards.empty()) {
		// Oregon no pass
		return;
	}

	QIn& qIn = *module.qIn;

	for (int code : cards) {
		qIn.myHand.add(code);
		qIn.myPass.remove(code);
	}
	qIn.leader.set(leaderMemo);
	qIn.playerFeatures[0]->passed.set(0);
}

std::string PassDiff::name() {
	std::stringstream ss;

	ss << Card(cards[0]).toString();
	for (int i = 1; i < (int)cards.size(); i++) {
		ss << "," << Card(cards[i]).toString();
	}

	return ss.str();
}

void PassDiff::logExtraDetails() {
	log->openDict("qIn");
	module.qIn->log(*log);
	log->close();
}

std::vector<std::shared_ptr<Diff>> PlayDecision::children() {
	std::vector<std::shared_ptr<Diff>> ans;
	int lastIndex = (module.core->leader + module.core->config.N - 1) % module.core->config.N;
	for (const Card* card : canPlay) {
		ans.push_back(std::make_shared<PlayDiff>(module, module.player->index, *card, lastIndex, 1.0));
	}
	return ans;
}

void applySoftMax(std::vector<std::shared_ptr<Diff>>& diffs) {
	double total = 0;
	for (std::shared_ptr<Diff> diff : diffs) {
		diff->p = exp(diff->p);
		total += diff->p;
	}
	for (std::shared_ptr<Diff> diff : diffs) {
		diff->p /= total;
	}
}

std::vector<std::shared_ptr<Diff>> PlayDiff::children() {
	std::vector<std::shared_ptr<Diff>> ans;
	if (index == lastIndex) {
		double q = 0;
		if (module.core->gameOver) {
			// Slightly misleading because this code can't actually be reached.
			q = (double)module.isMyScoreTheBest();
		}
		else {
			const std::vector<double>& qOut = module.qModel(*module.qIn);
			q = qOut[0];
		}
		ans.push_back(std::make_shared<WinDiff>(module, q));
	}
	else {
		int nextIndex = (index + 1) % module.core->config.N;
		const std::vector<double>& pOut = module.pModel(*module.pIn);
		for (const Card& card2 : module.core->deck.cardsNotPlayed) {
			if (module.player->hand.count(card2) > 0) {
				continue;
			}
			if (module.core->players[nextIndex].showedOut[card2.suit]) {
				continue;
			}
			ans.push_back(std::make_shared<PlayDiff>(module, nextIndex, card2, lastIndex, pOut[card2.code]));
		}
		//applySoftMax(ans);
	}
	return ans;
}

void PlayDiff::logExtraDetails() {
	if (index != lastIndex) {
		log->openDict("pIn");
		module.pIn->log(*log);
		log->close();
	}
	else {
		log->openDict("qIn");
		module.qIn->log(*log);
		log->close();
	}
}

void PlayDiff::apply() {
	HeartsCore& core = *module.core;
	HeartsPlayer& player = core.players[index];
	int N = core.config.N;

	// playCard
	undoData = std::make_unique<UnplayCard>(core, player, card);
	core.playCard(player, card);

	if (index == lastIndex) {
		// evaluateTrick
		undoData->next = std::make_unique<UnevaluateTrick>(core);
		core.evaluateTrick();

		if (core.trickIndex == core.trickCount - 1) {
			// score
			undoData->next->next = std::make_unique<Unscore>(core);

			// Simplify things by assuming the shooting player would choose what we would choose.
			ShootChoice shootChoice = NO_SHOOT;
			if (core.shooter >= 0) {
				shootChoice = GO_DOWN;
			}

			core.score(shootChoice);
		}
	}

	evolvePIn();
	evolveQIn();
}

int getPrevFollow(HeartsCore& core, int index) {
	if (index == core.leader) {
		return -1;
	}
	if (core.config.oregon) {
		int prevIndex = (index + core.config.N - 1) % core.config.N;
		return core.players[prevIndex].trick.suit;
	}
	return core.follow;
}

void PlayDiff::evolvePIn() {
	HeartsCore& core = *module.core;
	HeartsPlayer& player = core.players[index];
	int N = core.config.N;

	if (index == lastIndex) {
		return;
	}

	PIn& pIn = *module.pIn;

	int i = (index - core.leader + N) % N;
	if (index == module.player->index) {
		pIn.myHand.remove(card);
	}
	pIn.playerFeatures[i]->trick.set(&card);

	int prevFollow = getPrevFollow(core, index);
	if (prevFollow != -1) {
		pIn.playerFeatures[i]->showedOuts.set(prevFollow, (double)player.showedOut[prevFollow]);
	}
	pIn.turn.set((index + 1 - core.leader + N) % N);
}

void PlayDiff::evolveQIn() {
	HeartsCore& core = *module.core;
	HeartsPlayer& player = core.players[index];
	int N = core.config.N;

	QIn& qIn = *module.qIn;

	HeartsPlayer& myPlayer = *module.player;

	if (core.trickIndex == core.trickCount - 1) {
		for (int i = 0; i < N; i++) {
			int j = (myPlayer.index + i) % N;
			HeartsPlayer& player = core.players[j];

			qIn.playerFeatures[i]->score.set(std::max(player.score, module.negativeScoreTolerance - 1));
		}
		return;
	}

	if (index == module.player->index) {
		qIn.myHand.remove(card);
	}

	int prevFollow = getPrevFollow(core, index);
	if (prevFollow != -1) {
		int i = (index - myPlayer.index + N) % N;
		qIn.playerFeatures[i]->showedOuts.set(prevFollow, (double)player.showedOut[prevFollow]);
	}
	for (int i = 0; i < N; i++) {
		int j = (myPlayer.index + i) % N;
		HeartsPlayer& player = core.players[j];

		qIn.playerFeatures[i]->cardsPlayed.add(player.trick);
	}
	int i = (core.leader - myPlayer.index + N) % N;
	HeartsPlayer& leader = core.players[core.leader];
	qIn.playerFeatures[i]->points.set(leader.points);
	qIn.leader.set(i);
}

void PlayDiff::UnplayCard::undo() {
	core.follow = getPrevFollow(core, player.index);

	if (core.follow != -1) {
		player.showedOut[core.follow] = prevShowedOut;
	}
	core.heartsBroken = prevHeartsBroken;

	core.deck.cardsNotPlayed.insert(card);
	player.cardsPlayed.pop_back();
	core.points -= HeartsStaticData::points(card);
}

void PlayDiff::UnevaluateTrick::undo() {
	core.shooter = prevShooter;
	core.players[core.leader].points -= core.points;
	core.leader = prevLeader;
}

PlayDiff::Unscore::Unscore(HeartsCore& core) : Undo(core) {
	for (int i = 0; i < core.config.N; i++) {
		prevPoints.push_back(core.players[i].points);
		prevScores.push_back(core.players[i].score);
	}
}

void PlayDiff::Unscore::undo() {
	for (HeartsPlayer& player : core.players) {
		player.points = prevPoints[player.index];
		player.score = prevScores[player.index];
	}
	core.gameOver = false;
}

void PlayDiff::undo() {
	HeartsCore& core = *module.core;
	int leaderMemo = core.leader;
	
	if (undoData != nullptr) {
		undoData->undoAll();
	}

	devolvePIn();
	devolveQIn(leaderMemo);
}

void PlayDiff::devolvePIn() {
	HeartsCore& core = *module.core;
	HeartsPlayer& player = core.players[index];
	int N = core.config.N;

	if (index == lastIndex) {
		return;
	}

	PIn& pIn = *module.pIn;

	int i = (index - core.leader + N) % N;
	if (index == module.player->index) {
		pIn.myHand.add(card);
	}
	pIn.playerFeatures[i]->trick.set(nullptr);
	if (core.follow != -1) {
		pIn.playerFeatures[i]->showedOuts.set(core.follow, (double)player.showedOut[core.follow]);
	}
	pIn.turn.set(index - core.leader + N);
}

void PlayDiff::devolveQIn(int leaderMemo) {
	HeartsCore& core = *module.core;
	HeartsPlayer& player = core.players[index];
	int N = core.config.N;

	QIn& qIn = *module.qIn;

	HeartsPlayer& myPlayer = *module.player;

	if (core.trickIndex == core.trickCount - 1) {
		for (int i = 0; i < N; i++) {
			int j = (myPlayer.index + i) % N;
			HeartsPlayer& player = core.players[j];

			qIn.playerFeatures[i]->score.set(std::max(player.score, module.negativeScoreTolerance - 1));
		}
		return;
	}

	if (index == myPlayer.index) {
		qIn.myHand.add(card);
	}
	int i = (index - myPlayer.index + N) % N;
	if (core.follow != -1) {
		qIn.playerFeatures[i]->showedOuts.set(core.follow, (double)player.showedOut[core.follow]);
	}
	for (int i = 0; i < N; i++) {
		int j = (myPlayer.index + i) % N;
		HeartsPlayer& player = core.players[j];

		qIn.playerFeatures[i]->cardsPlayed.remove(player.trick);
	}
	i = (leaderMemo - myPlayer.index + N) % N;
	HeartsPlayer& leader = core.players[leaderMemo];
	qIn.playerFeatures[i]->points.set(leader.points);
	qIn.leader.set(i);
}

std::string PlayDiff::name() {
	std::stringstream ss;

	ss << index << "," << card.toString();

	return ss.str();
}