#include <pybind11/functional.h>
#include <pybind11/numpy.h>
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include "core.h"
#include "modules/markov/module_markov.h"
#include "modules/random/module_random.h"

namespace py = pybind11;

PYBIND11_MODULE(_hearts, m) {
	py::module::import("_games");

	py::class_<HeartsConfig>(m, "HeartsConfig")
		.def(py::init<int, bool, int, unsigned>())
		.def_readwrite("N", &HeartsConfig::N)
		.def_readwrite("oregon", &HeartsConfig::oregon)
		.def_readwrite("maxRounds", &HeartsConfig::maxRounds)
		.def_readwrite("seed", &HeartsConfig::seed);

	py::class_<HeartsCore>(m, "HeartsCore")
		.def(py::init<HeartsConfig>())
		.def("setModule", &HeartsCore::setModule)
		.def("setModule", [](HeartsCore& core, int index, HeartsAiModuleMarkov* module) -> void { core.setModule(index, module); })
		.def("setModule", [](HeartsCore& core, int index, HeartsAiModuleRandom* module) -> void { core.setModule(index, module); })
		.def("run", &HeartsCore::run);

	py::class_<HeartsAiModuleRandom>(m, "HeartsAiModuleRandom")
		.def(py::init());

	py::class_<HeartsAiModuleMarkov, PyHeartsAiModuleMarkov>(m, "HeartsAiModuleMarkov")
		.def(py::init<int, double, bool>())
		.def_readwrite("greed", &HeartsAiModuleMarkov::greed)
		.def_readwrite("pPairs", &HeartsAiModuleMarkov::pPairs)
		.def_readwrite("qPairs", &HeartsAiModuleMarkov::qPairs)
		.def("getPInSize", &HeartsAiModuleMarkov::getPInSize)
		.def("getQInSize", &HeartsAiModuleMarkov::getQInSize);
}