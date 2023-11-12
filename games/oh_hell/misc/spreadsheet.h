#include <chrono>
#include <iostream>
#include <fstream>
#include <random>
#include <sstream>
#include <vector>

namespace oh_hell {

std::string nums[14] = {"2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", " "};
std::string suits[4] = {"C", "D", "S", "H"};
double p0 = 15.0 / 31;

class SSCard {
public:
	void set(int code) {
		this->code = code;
		num = code % 13;
		suit = code / 13;
	}

	std::string toString() {
		return nums[num] + suits[suit];
	}

	int num = 0;
	int suit = 0;
	int code = 0;
};

int randomCode(int* deck, std::uniform_int_distribution<std::mt19937::result_type>& dist, std::mt19937& rng) {
	while (true) {
		int code = dist(rng);
		if (deck[code] > 0) {
			deck[code]--;
			return code;
		}
	}
}

void resetDeck(int* deck, std::vector<SSCard>& cards, SSCard& trump, int N, int D) {
	for (int i = 0; i < N; i++) {
		deck[cards[i].code] = D;
	}
	deck[trump.code] = D;
}

double getX2(double a, double b) {
	// Chi-squared relative to null hypothesis p0.
	double n = a + b;
	return a * a / (p0 * n) + b * b / ((1 - p0) * n) - n;
}

class Spreadsheet {
public:
	class Entry {
	public:
		Entry(int D, int trumpNum, double X2Threshold, std::ofstream& outputFile): X2Threshold(X2Threshold), outputFile(outputFile)  {
			if (D == 1) {
				// Player will never have the same card as trump, so max out our confidence there.
				X2[trumpNum] = std::numeric_limits<double>::max();
			}
		}

		int add(int i, int j, int k, bool win, int doneCount, int total) {
			double& count = win ? a[k] : b[k];
			count++;

			X2[k] = getX2(a[k], b[k]);
			if (isConfident(k)) {
				outputFile << i << "," << j << "," << k << "," << a[k] << "," << b[k] << "\n";

				long n = 0;
				int cutoff = -1;
				for (int c = 0; c < 13; c++) {
					if (!isConfident(c)) {
						return 0;
					} else if (cutoff == -1 && a[c] + b[c] != 0 && a[c] / (a[c] + b[c]) > p0) {
						cutoff = c;
					}
					n += a[c] + b[c];
				}
				if (cutoff == -1) {
					cutoff = 13;
				}

				setCutoff(i, j, cutoff, n, doneCount, total);
				return 1;
			}

			return 0;
		}

		bool isConfident(int k) {
			return X2[k] > X2Threshold;
		}

		void setCutoff(int i, int j, int cutoff, int n, int doneCount, int total) {
			cutoffNum = cutoff;
			std::cout << "(" << (doneCount + 1) << "/" << total << ") " << "Reached confidence with trump = " << nums[i] << ", bids = ";
			for (int jj = j + 1; jj >= 2; jj >>= 1) {
				std::cout << jj % 2;
			}
			std::cout << ": cutoff = " << nums[cutoffNum] << " after " << n << " games." << std::endl;
		}

		double a[13] = {};
		double b[13] = {};
		double X2[13] = {};
		double X2Threshold;
		int cutoffNum = -1;
		std::ofstream& outputFile;
	};

	Spreadsheet(int N, int D, double X2Threshold, std::ofstream& outputFile): total(13 * ((1 << N) - 1)) {
		for (int i = 0; i < 13; i++) {
			entries.emplace_back();
			for (int j = 0; j < ((1 << N) - 1); j++) {
				entries[i].emplace_back(D, i, X2Threshold, outputFile);
			}
		}

		outputFile << "trumpCard,bidCode,bidderCard,wins,losses\n";
	}

	bool add(int i, int j, int k, bool win) {
		doneCount += entries[i][j].add(i, j, k, win, doneCount, total);

		if (entries[i][j].cutoffNum == 13) {
			propagateCutoff13(i, j);
		}

		if (entries[i][j].cutoffNum == 12 && i == 12) {
			// If cutoff and trump are both ace, and I bid 1, then everyone else must bid 0.
			propagateCutoff13(i, 2 * j + 2);
		}

		if (doneCount == total) {
			return true;
		}

		return false;
	}

	void propagateCutoff13(int i, int j) {
		if (j >= (int)entries[i].size()) {
			return;
		}

		if (entries[i][j].cutoffNum == -1) {
			entries[i][j].setCutoff(i, j, 13, 0, doneCount, total);
			doneCount++;
		}

		propagateCutoff13(i, 2 * j + 1);
		propagateCutoff13(i, 2 * j + 2);
	}

	int getCutoffNum(int i, int j) {
		return entries[i][j].cutoffNum;
	}

	bool isConfident(int i, int j, int k) {
		return entries[i][j].isConfident(k);
	}

	std::vector<std::vector<Entry>> entries; // index by (trump num, bid sequence)
	int doneCount = 0;
	int total;
};

void generateSpreadsheet(int N, int D, std::string output_fname) {
	//	double X2Threshold = 7.879; // Confidence p = 0.005
	double X2Threshold = 15.13670523; // Confidence p = 0.0001
	//	double X2Threshold = 19.51142096464506; // Confidence p = 0.00001
	bool verbose = false;

	std::ofstream file;
	file.open(output_fname);

	Spreadsheet ss(N, D, X2Threshold, file);

	unsigned seed = std::chrono::system_clock::now().time_since_epoch().count();
	std::mt19937 rng(seed);
	std::uniform_int_distribution<std::mt19937::result_type> dist(0, 51);

	int deck[52] = {};
	for (int i = 0; i < 52; i++) {
		deck[i] = D;
	}

	std::vector<SSCard> cards(N);
	SSCard trump;

	for (long rep = 0; true; rep++) {
		// Deal
		for (int i = 0; i < N; i++) {
			cards[i].set(randomCode(deck, dist, rng));
		}
		trump.set(randomCode(deck, dist, rng));
		if (verbose) {
			std::cout << "Rep " << rep << ":" << std::endl;
			std::cout << "Trump = " << trump.toString() << std::endl;
			std::cout << "Cards = ";
			for (int i = 0; i < N; i++) {
				std::cout << cards[i].toString() << " ";
			}
			std::cout << std::endl;
		}

		// Bid
		int j = 0; // Encoded sequence of bids
		int b = 0; // Bidder that needs training
		for (; b < N; b++) {
			int cutoff = ss.getCutoffNum(trump.num, j);
			if (cutoff == -1) {
				break;
			}
			if (cards[b].suit == trump.suit && cards[b].num >= cutoff) {
				if (verbose) {
					std::cout << "Player " << b << " bids 1." << std::endl;
				}
				j = 2 * j + 2;
			}
			else {
				if (verbose) {
					std::cout << "Player " << b << " bids 0." << std::endl;
				}
				j = 2 * j + 1;
			}
		}
		if (verbose) {
			std::cout << "Bidder = " << b << std::endl;
		}

		if (b == N) {
			if (verbose) {
				std::cout << "Rep " << rep << ": no bidder needs training.\n" << std::endl;
			}
			resetDeck(deck, cards, trump, N, D);
			continue;
		}

		if (cards[b].suit != trump.suit) {
			if (verbose) {
				std::cout << "Rep " << rep << ": bidder does not have trump.\n" << std::endl;
			}
			resetDeck(deck, cards, trump, N, D);
			continue;
		}

		if (ss.isConfident(trump.num, j, cards[b].num)) {
			if (verbose) {
				std::cout << "Rep " << rep << ": bidder is already confident.\n" << std::endl;
			}
			resetDeck(deck, cards, trump, N, D);
			continue;
		}

		// Play
		int w = 0;
		bool winnerCanceled = D == 2 && deck[cards[w].code] == 0 && cards[w].code != trump.code;
		for (int i = 1; i < N; i++) {
			SSCard& card = cards[i];
			if (D == 2 && deck[card.code] == 0 && card.code != trump.code) {
				// Canceled
				continue;
			}

			if (
				(card.suit == trump.suit && cards[w].suit != trump.suit) // card is trump and trump not led
				|| (
					card.suit == cards[w].suit
					&& (
						card.num > cards[w].num // card beats current winner
						|| winnerCanceled       // leader was canceled
						)
					)
				) {
				w = i;
				winnerCanceled = false;
			}
		}

		// Print
		if (verbose) {
			std::cout << "Winner = " << w << " (" << cards[w].toString() << ")\n" << std::endl;
		}

		// Record
		if (ss.add(trump.num, j, cards[b].num, w == b)) {
			break;
		}

		// Reset deck
		resetDeck(deck, cards, trump, N, D);
	}

	file.close();
}

}