cmake_minimum_required (VERSION 3.8)

project("Games")

add_subdirectory(extern/pybind11)

pybind11_add_module(
	_games
	games/ml.cpp
	games/pygames.cpp
)
target_include_directories(_games PUBLIC games)

pybind11_add_module(
	_hearts
	games/cards.cpp
	games/hearts/core.cpp
	games/ml.cpp
	games/hearts/modules/markov/module_markov.cpp
	games/hearts/modules/random/module_random.cpp
	games/hearts/pyhearts.cpp
)
target_include_directories(_hearts PUBLIC games)

pybind11_add_module(
	_euchre
	games/cards.cpp
	games/euchre/core.cpp
	games/ml.cpp
	games/euchre/cores/markov/core_markov.cpp
	games/euchre/cores/random/core_random.cpp
	games/euchre/pyeuchre.cpp
)
target_include_directories(_euchre PUBLIC games)