#include <pybind11/functional.h>
#include <pybind11/numpy.h>
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include "misc/spreadsheet.h"

namespace py = pybind11;

PYBIND11_MODULE(_oh_hell, m) {
	py::module::import("_games");

	m.def("generate_spreadsheet", &oh_hell::generateSpreadsheet);
}