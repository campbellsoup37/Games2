#include <pybind11/functional.h>
#include <pybind11/numpy.h>
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include "core.h"
#include "cores/markov/core_markov.h"
#include "cores/random/core_random.h"

namespace py = pybind11;

class PyEuchreCoreMarkov : public EuchreCoreMarkov {
public:
	using EuchreCoreMarkov::EuchreCoreMarkov;

	//virtual const std::vector<double>& tModel(const SparseVector& vec) override {
	//	PYBIND11_OVERRIDE_PURE(const std::vector<double>&, EuchreCoreMarkov, tModel, vec);
	//}

	//virtual const std::vector<double>& pModel(const SparseVector& vec) override {
	//	PYBIND11_OVERRIDE_PURE(const std::vector<double>&, EuchreCoreMarkov, pModel, vec);
	//}

	//virtual const std::vector<double>& rModel(const SparseVector& vec) override {
	//	PYBIND11_OVERRIDE_PURE(const std::vector<double>&, EuchreCoreMarkov, rModel, vec);
	//}

	//virtual std::shared_ptr<std::vector<double>> wModel(const SparseVector& vec) override {
	//	PYBIND11_OVERRIDE_PURE(std::shared_ptr<std::vector<double>>, EuchreCoreMarkov, wModel, vec);
	//}

	virtual void ipdb() override {
		PYBIND11_OVERRIDE_PURE(void, EuchreCoreMarkov, ipdb);
	}
};

PYBIND11_MODULE(_euchre, m) {
	py::module::import("_games");

	py::class_<EuchreConfig>(m, "EuchreConfig")
		.def(py::init<bool, int, unsigned>())
		.def_readwrite("N", &EuchreConfig::N)
		.def_readwrite("h", &EuchreConfig::h)
		.def_readwrite("lowCard", &EuchreConfig::lowCard)
		.def_readwrite("winningPoints", &EuchreConfig::winningPoints)
		.def_readwrite("stickTheDealer", &EuchreConfig::stickTheDealer)
		.def_readwrite("maxRounds", &EuchreConfig::maxRounds)
		.def_readwrite("seed", &EuchreConfig::seed);

	py::class_<EuchreCoreRandom>(m, "EuchreCoreRandom")
		.def(py::init<EuchreConfig>())
		.def("initialize", &EuchreCoreRandom::initialize)
		.def("run", &EuchreCoreRandom::run);

	py::class_<EuchreCoreMarkov, PyEuchreCoreMarkov>(m, "EuchreCoreMarkov")
		.def(py::init<EuchreConfig>())
		.def_readwrite("config", &EuchreCoreMarkov::config)
		.def("initialize", &EuchreCoreMarkov::initialize)
		.def_readwrite("emptyTIn", &EuchreCoreMarkov::emptyTIn)
		.def_readwrite("emptyPIn", &EuchreCoreMarkov::emptyPIn)
		.def_readwrite("emptyRIn", &EuchreCoreMarkov::emptyRIn)
		.def_readwrite("emptyWIn", &EuchreCoreMarkov::emptyWIn)
		.def("clearData", &EuchreCoreMarkov::clearData)
		.def_readwrite("tnnCpp", &EuchreCoreMarkov::tnn)
		.def_readwrite("pnnCpp", &EuchreCoreMarkov::pnn)
		.def_readwrite("rnnCpp", &EuchreCoreMarkov::rnn)
		.def_readwrite("wnnCpp", &EuchreCoreMarkov::wnn)
		.def_readwrite("tData", &EuchreCoreMarkov::tData)
		.def_readwrite("pData", &EuchreCoreMarkov::pData)
		.def_readwrite("rData", &EuchreCoreMarkov::rData)
		.def_readwrite("wData", &EuchreCoreMarkov::wData)
		.def_property_readonly("players", 
			[](EuchreCoreMarkov& self) -> std::vector<EuchrePlayerMarkov*> {
				std::vector<EuchrePlayerMarkov*> ans;
				for (auto& player : self.players) {
					ans.push_back(dynamic_cast<EuchrePlayerMarkov*>(&*player));
				}
				return ans;
			})
		.def_readwrite("scores", &EuchreCoreMarkov::scores)
		.def("run", &EuchreCoreMarkov::run);

	py::class_<EuchrePlayerMarkov>(m, "EuchrePlayerMarkov")
		.def_readwrite("greed", &EuchrePlayerMarkov::greed)
		.def_readwrite("shouldLog", &EuchrePlayerMarkov::shouldLog);

	py::class_<FeatureCard, FeatureOneHot>(m, "FeatureCard")
		.def_readwrite("name", &FeatureCard::name)
		.def_readwrite("d", &FeatureCard::d)
		.def_readwrite("offset", &FeatureCard::offset)
		.def("labels", &FeatureCard::labels)
		.def_readwrite("min", &FeatureCard::min)
		.def_readwrite("value", &FeatureCard::value);

	py::class_<FeatureHand, FeatureDense>(m, "FeatureHand")
		.def_readwrite("name", &FeatureHand::name)
		.def_readwrite("d", &FeatureHand::d)
		.def_readwrite("offset", &FeatureHand::offset)
		.def("labels", &FeatureHand::labels)
		.def_readwrite("values", &FeatureHand::values);

	py::class_<FeatureShowedOuts, FeatureDense>(m, "FeatureShowedOuts")
		.def_readwrite("name", &FeatureShowedOuts::name)
		.def_readwrite("d", &FeatureShowedOuts::d)
		.def_readwrite("offset", &FeatureShowedOuts::offset)
		.def("labels", &FeatureShowedOuts::labels)
		.def_readwrite("values", &FeatureShowedOuts::values);

	py::class_<TNN, NeuralNetwork>(m, "TNN");

	py::class_<PNN, NeuralNetwork>(m, "PNN");

	py::class_<RNN, NeuralNetwork>(m, "RNN");

	py::class_<WNN, NeuralNetwork>(m, "WNN");
}