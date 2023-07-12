

void subsetProb(const std::vector<double>& p, std::vector<double>& q) {
	q.clear();
	q.resize(p.size() + 1, 0.0);
	q[0] = 1.0;
	for (int i = 0; i < (int)p.size(); i++) {
		double prev = 0;
		for (int j = 0; j <= i + 1; j++) {
			double next = q[j];
			q[j] = p[i] * prev + (1 - p[i]) * next;
			prev = next;
		}
	}
}