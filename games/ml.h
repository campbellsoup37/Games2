#pragma once

#include <cmath>
#include <list>
#include <map>
#include <memory>
#include <iostream>

#include "logging.h"

// vectors and features

class Feature;

class SparseVector {
public:
	SparseVector() = default;
	SparseVector(const SparseVector& other);

	int insert(int index, double value);
	void erase(int position);
	void set(int position, int index, double value);

	int size() const;
	void addSize(int d);

	void log(Log& logger);
	std::vector<double> toVector();
	std::map<std::string, std::vector<double>> toDict();

	std::vector<std::vector<int>> indices;
	std::vector<double> values;
	std::vector<int> denseShape = {1, 0};
	std::list<Feature*> features;
};

class InOutPair {
public:
	InOutPair(std::shared_ptr<SparseVector> in, std::shared_ptr<std::vector<double>> out) : in(in), out(out) {}

	std::shared_ptr<SparseVector> in;
	std::shared_ptr<std::vector<double>> out;
};

class Feature {
public:
	Feature(SparseVector& vec, std::string name, int d);

	virtual void log(Log& logger);
	virtual std::vector<double> toVector(const std::vector<double>& vec);
	virtual std::vector<std::string> labels();

	SparseVector& vec;
	std::string name;
	int offset;
	int d;
};

class FeatureOneHot : public Feature {
public:
	FeatureOneHot(SparseVector& vec, std::string name, int max, int min = 0) : Feature(vec, name, max - min), min(min), value(min), position(-1) {}

	void set(int newValue);
	int get() { return value; }

	void log(Log& logger) override;
	std::vector<double> toVector(const std::vector<double>& vec) override;
	virtual std::vector<std::string> labels() override;

	int min;
	int value;
	int position;
};

class FeatureDense : public Feature {
public:
	FeatureDense(SparseVector& vec, std::string name, int d);

	void set(int index, double newValue);

	void log(Log& logger) override;

	std::vector<double> values;
	std::vector<int> positions;
};

// layers

class ActivationFunction {
public:
	virtual void apply(std::vector<double>& vec) {}
};

class ReLU : public ActivationFunction {
public:
	void apply(std::vector<double>& vec) override {
		for (int i = 0; i < (int)vec.size(); i++) {
			vec[i] = std::max<double>(vec[i], 0.0);
		}
	}
};

class Softmax : public ActivationFunction {
public:
	void apply(std::vector<double>& vec) override {
		double total = 0;
		for (int i = 0; i < (int)vec.size(); i++) {
			vec[i] = exp(vec[i]);
			total += vec[i];
		}
		for (int i = 0; i < (int)vec.size(); i++) {
			vec[i] /= total;
		}
	}
};

class Layer {
public:
	Layer(std::string activation) {
		if (activation == "relu") {
			act = std::make_shared<ReLU>();
		}
		else if (activation == "softmax") {
			act = std::make_shared<Softmax>();
		}
		else {
			std::stringstream ss;
			ss << "invalid activation function \"" << activation << "\"";
			throw std::invalid_argument(ss.str());
		}
	}

	std::shared_ptr<std::vector<double>> operator()(const SparseVector& vec, const std::string& source = "") {
		if (M.size() == 0) {
			std::stringstream ss;
			ss << source << ": evaluating layer -- empty M.";
			throw std::runtime_error(ss.str());
		}

		if (vec.size() != M[0].size()) {
			std::stringstream ss;
			ss << source << ": evaluating layer -- SparseVector size " << vec.size() << ", M size " << M.size() << "x" << M[0].size();
			throw std::runtime_error(ss.str());
		}

		if (b.size() != M.size()) {
			std::stringstream ss;
			ss << source << ": evaluating layer -- M size " << M.size() << "x" << M[0].size() << ", b size " << b.size();
			throw std::runtime_error(ss.str());
		}

		std::shared_ptr<std::vector<double>> out = std::make_shared<std::vector<double>>();
		for (int j = 0; j < (int)M.size(); j++) {
			double x = b[j];
			for (int k = 0; k < (int)vec.indices.size(); k++) {
				x += M[j][vec.indices[k][1]] * vec.values[k];
			}
			if (isnan(x)) {
				std::cout << source << ": evaluating layer -- entry " << j << " is nan";
			}
			out->push_back(x);
		}
		act->apply(*out);
		return out;
	}

	std::shared_ptr<std::vector<double>> operator()(const std::vector<double>& vec, const std::string& source = "") {
		if (M.size() == 0) {
			std::stringstream ss;
			ss << source << ": evaluating layer -- empty M.";
			throw std::runtime_error(ss.str());
		}

		if (vec.size() != M[0].size()) {
			std::stringstream ss;
			ss << source << ": evaluating layer -- vector size " << vec.size() << ", M size " << M.size() << "x" << M[0].size();
			throw std::runtime_error(ss.str());
		}

		if (b.size() != M.size()) {
			std::stringstream ss;
			ss << source << ": evaluating layer -- M size " << M.size() << "x" << M[0].size() << ", b size " << b.size();
			throw std::runtime_error(ss.str());
		}

		std::shared_ptr<std::vector<double>> out = std::make_shared<std::vector<double>>();
		for (int j = 0; j < (int)M.size(); j++) {
			double x = b[j];
			for (int i = 0; i < (int)M[0].size(); i++) {
				x += M[j][i] * vec[i];
			}
			if (isnan(x)) {
				std::cout << source << ": evaluating layer -- entry " << j << " is nan";
			}
			out->push_back(x);
		}
		act->apply(*out);
		return out;
	}

	std::vector<std::vector<double>> M;
	std::vector<double> b;
	std::shared_ptr<ActivationFunction> act;
};

class NeuralNetwork {
public:
	NeuralNetwork(const std::string& name) : name(name) {}

	std::shared_ptr<std::vector<double>> operator()(const SparseVector& vec) {
		std::shared_ptr<std::vector<double>> out = layers[0](vec, name);
		for (int i = 1; i < (int)layers.size(); i++) {
			out = layers[i](*out, name);
		}
		return out;
	}

	std::string name;
	std::vector<Layer> layers;
	virtual std::vector<std::string> labels() { return {}; };
};
