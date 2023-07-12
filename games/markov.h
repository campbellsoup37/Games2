#pragma once

#include <iostream>
#include <random>

#include "logging.h"

class Diff {
public:
	Diff(double p, Log* log = nullptr) : p(p), cachedE(-1), log(log) {}

	virtual std::vector<std::shared_ptr<Diff>> children() { return {}; }
	virtual void apply() {}
	virtual void undo() {}

	virtual double E() {
		//std::cerr << "entered " << name() << std::endl;
		if (logging()) {
			log->openDict(name());
			log->write("class", cls());
			log->write("p", p);
		}
		apply();
		//std::cerr << "applied " << name() << std::endl;
		if (logging()) {
			logExtraDetails();
		}
		double ans = 0;
		for (auto& d : children()) {
			//std::cerr << "entering " << (d ? d->name() : "nullptr") << std::endl;
			ans += d->p * d->E();
			//std::cerr << "exited " << d->name() << std::endl;
		}
		undo();
		//std::cerr << "undid " << name() << std::endl;

		if (logging()) {
			log->write("E", ans);
			log->close();
		}

		cachedE = ans;
		//std::cerr << "exiting " << name() << std::endl;

		return ans;
	}

	std::shared_ptr<Diff> best() {
		//std::cerr << "entered " << name() << std::endl;
		if (logging()) {
			log->write("class", cls());
			log->openDict(name());
			logExtraDetails();
		}

		std::shared_ptr<Diff> bestD = nullptr;
		double bestE = std::numeric_limits<double>::lowest();

		for (auto& d : children()) {
			//std::cerr << "entering " << (d ? d->name() : "nullptr") << std::endl;
			double e = d->E();
			if (bestD == nullptr || e > bestE) {
				bestD = d;
				bestE = e;
			}
			//std::cerr << "exited " << d->name() << std::endl;
		}
		//std::cerr << "exiting " << name() << ", best=" << bestD << (bestD ? " (" + bestD->name() + ")" : "") << std::endl;

		if (logging()) {
			log->write("best", bestD->name());
			log->close();
		}

		return bestD;
	}

	virtual int weight() { return 1; }

	std::shared_ptr<Diff> random(std::mt19937& rng) {
		if (logging()) {
			log->write("class", cls());
			log->openDict(name());
			logExtraDetails();
		}

		std::shared_ptr<Diff> choice;
		int n = 0;
		for (auto& d : children()) {
			int w = d->weight();
			n += w;
			if ((int)(rng() % n) < w) {
				choice = d;
			}
		}

		if (logging()) {
			log->write("random", choice->name());
			log->close();
		}

		return choice;
	}

	bool logging() {
		return log != nullptr && log->logging;
	}

	virtual std::string cls() { return "Diff"; }
	virtual std::string name() { return ""; }

	virtual void logExtraDetails() {}

	double p;
	double cachedE;
	Log* log;
};

class TerminalDiff : public Diff {
public:
	TerminalDiff(double p, double e, Log* log = nullptr) : Diff(p, log), e(e) {}

	virtual double E() {
		if (logging()) {
			log->openDict(name());
			log->write("class", cls());
			log->write("p", p);
			log->write("E", e);
			log->close();
		}

		return e;
	}

	double e;
};