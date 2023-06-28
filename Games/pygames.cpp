#include <pybind11/functional.h>
#include <pybind11/numpy.h>
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include "ml.h"

namespace py = pybind11;

PYBIND11_MODULE(_games, m) {
	py::class_<SparseVector, std::shared_ptr<SparseVector>>(m, "SparseVector")
		.def_property(
			"indices",
			[](SparseVector& vec) {
				const py::array& out = py::cast(vec.indices);
				return out;
			},
			[](SparseVector& vec) {}
		).def_property(
			"values",
			[](SparseVector& vec) {
				const py::array& out = py::cast(vec.values);
				return out;
			},
			[](SparseVector& vec) {}
		).def_property(
			"denseShape",
			[](SparseVector& vec) {
				const py::array& out = py::cast(vec.denseShape);
				return out;
			},
			[](SparseVector& vec) {}
		).def_readwrite("features", &SparseVector::features)
		.def("size", &SparseVector::size)
		.def("toVector", &SparseVector::toVector)
		.def("toDict", &SparseVector::toDict);

	py::class_<Feature>(m, "Feature")
		.def_readwrite("name", &Feature::name)
		.def_readwrite("d", &Feature::d)
		.def_readwrite("offset", &Feature::offset);

	py::class_<FeatureOneHot>(m, "FeatureOneHot")
		.def_readwrite("name", &FeatureOneHot::name)
		.def_readwrite("d", &FeatureOneHot::d)
		.def_readwrite("offset", &FeatureOneHot::offset)
		.def("labels", &FeatureOneHot::labels)
		.def_readwrite("min", &FeatureOneHot::min)
		.def_readwrite("value", &FeatureOneHot::value);

	py::class_<FeatureDense>(m, "FeatureDense")
		.def_readwrite("name", &FeatureDense::name)
		.def_readwrite("d", &FeatureDense::d)
		.def_readwrite("offset", &FeatureDense::offset)
		.def("labels", &FeatureDense::labels)
		.def_readwrite("values", &FeatureDense::values);

	py::class_<InOutPair>(m, "InOutPair")
		.def_property("inp", [](InOutPair& pair) { return *pair.in; }, [](InOutPair& pair) {})
		.def_property(
			"out",
			[](InOutPair& pair) {
				const py::array& out = py::cast(*pair.out);
				return out;
			},
			[](InOutPair& pair) {}
		);

	py::class_<Layer>(m, "Layer")
		.def(py::init<std::string>())
		.def_readwrite("M", &Layer::M)
		.def_readwrite("b", &Layer::b)
		.def(
			"__call__", 
			[](Layer& layer, SparseVector& vec) {
				const py::array& out = py::cast(*layer(vec));
				return out;
			}
		).def(
			"__call__",
			[](Layer& layer, std::vector<double>& vec) {
				const py::array& out = py::cast(*layer(vec));
				return out;
			}
		);

	py::class_<NeuralNetwork>(m, "NeuralNetwork")
		.def_readwrite("layers", &NeuralNetwork::layers).def(
			"__call__",
			[](NeuralNetwork& nn, SparseVector& vec) {
				const py::array& out = py::cast(*nn(vec));
				return out;
			}
		)
		.def("labels", &NeuralNetwork::labels);
}