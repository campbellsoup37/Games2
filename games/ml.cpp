#include "ml.h"

// SparseVector

SparseVector::SparseVector(const SparseVector& other) {
	indices = other.indices;
	values = other.values;
	denseShape = other.denseShape;
	
	for (auto& feature : other.features) {
		features.push_back(new Feature{ *feature });
	}
}

int SparseVector::insert(int index, double value) {
	int ans = (int)indices.size();
	indices.push_back({ 0, index });
	values.push_back(value);
	return ans;
}

void SparseVector::erase(int position) {
	indices.erase(indices.begin() + position);
	values.erase(values.begin() + position);
}

void SparseVector::set(int position, int index, double value) {
	indices[position][1] = index;
	values[position] = value;
}

int SparseVector::size() {
	return denseShape[1];
}

void SparseVector::addSize(int d) {
	denseShape[1] += d;
}

void SparseVector::log(Log& logger) {
	if (logger.logging) {
		for (Feature* feature : features) {
			feature->log(logger);
		}
	}
}

std::vector<double> SparseVector::toVector() {
	std::vector<double> out;
	for (int i = 0; i < size(); i++) {
		out.push_back(0.0);
	}
	for (int i = 0; i < (int)indices.size(); i++) {
		out[indices[i][1]] = values[i];
	}
	return out;
}

std::map<std::string, std::vector<double>> SparseVector::toDict() {
	std::vector<double> vec = toVector();
	std::map<std::string, std::vector<double>> out;
	for (Feature* feature : features) {
		// We need to give vec to the feature because features don't get deep copied
		out[feature->name] = feature->toVector(vec);
	}
	return out;
}

// Feature

Feature::Feature(SparseVector& vec, std::string name, int d) : vec(vec), name(name), offset(vec.denseShape[1]), d(d) {
	vec.addSize(d);
	vec.features.push_back(this);
}

void Feature::log(Log& logger) {
	if (logger.logging) {
		logger.openFlatDict(name);
		logger.write("d", d);
		logger.close();
	}
}

std::vector<double> Feature::toVector(const std::vector<double>& vec) {
	std::vector<double> out;
	for (int i = 0; i < d; i++) {
		out.push_back(vec[offset + i]);
	}
	return out;
}

std::vector<std::string> Feature::labels() {
	std::vector<std::string> ans;
	for (int i = 0; i < d; i++) {
		ans.push_back(std::to_string(i));
	}
	return ans;
}

// FeatureOneHot

void FeatureOneHot::set(int newValue) {
	if (newValue < min || newValue > min + d) {
		return;
		//std::stringstream ss;
		//ss << "Attempted to set FeatureOneHot " << name << " (min=" << min << ", max=" << (min + d) << ") to " << newValue;
		//throw std::invalid_argument(ss.str());
	}

	if (newValue == value) {
		return;
	}

	if (position == -1) {
		if (newValue == min) {
			return;
		}

		position = vec.insert(offset + newValue - min - 1, 1.0);
	}
	else if (newValue == min) {
		vec.set(position, offset, 0.0);
	}
	else {
		vec.set(position, offset + newValue - min - 1, 1.0);
	}

	value = newValue;
}

void FeatureOneHot::log(Log& logger) {
	if (logger.logging) {
		logger.openFlatDict(name);
		logger.write("d", d);
		logger.write("offset", offset);
		logger.write("min", min);
		logger.write("max", d + min);
		logger.write("value", value);
		if (position >= 0) {
			logger.write("index", vec.indices[position][1]);
		}
		logger.close();
	}
}

std::vector<double> FeatureOneHot::toVector(const std::vector<double>& vec) {
	// Multiple SparseVectors could be pointing to this feature due to copying. The SparseVector this feature points back to
	// could have a different value from the SparseVector that is calling this function. Therefore, we actually need to read
	// through the given vector and reverse engineer the value.
	int trueValue = -1;
	for (int i = 0; i < d; i++) {
		if (vec[offset + i] != 0.0) {
			trueValue = i;
			break;
		}
	}
	return {(double)(trueValue + 1 + min)};
}

std::vector<std::string> FeatureOneHot::labels() {
	std::vector<std::string> ans;
	for (int i = 0; i <= d; i++) {
		ans.push_back(std::to_string(min + i));
	}
	return ans;
}

// FeatureDense

FeatureDense::FeatureDense(SparseVector& vec, std::string name, int d) : Feature(vec, name, d) {
	values.resize(d);
	positions.reserve(d);
	for (int i = 0; i < d; i++) {
		positions.push_back(-1);
	}
}

void FeatureDense::set(int index, double newValue) {
	if (index < 0 || index >= d) {
		return;
		//std::stringstream ss;
		//ss << "Attempted to set index " << index << " of FeatureDense " << name << " (d=" << d << ") to " << newValue;
		//throw std::invalid_argument(ss.str());
	}

	if (values[index] == newValue) {
		return;
	}

	if (positions[index] == -1) {
		positions[index] = vec.insert(offset + index, newValue);
	}
	else {
		vec.set(positions[index], offset + index, newValue);
	}

	values[index] = newValue;
}

void FeatureDense::log(Log& logger) {
	if (logger.logging) {
		logger.openFlatDict(name);
		logger.write("d", d);
		logger.write("offset", offset);
		logger.openFlatList("vector");
		for (double value : values) {
			logger.write(value);
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