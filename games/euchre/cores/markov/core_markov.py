import numpy as np
import time

from _euchre import EuchreConfig, EuchreCoreMarkov as _EuchreCoreMarkov
import games

def data_to_in_tf_args(data):
    indices = []
    values = []
    dense_shape = [0, 0]

    for i, pair in enumerate(data):
        for index, value in zip(pair.inp.indices, pair.inp.values):
            if value == 0.0:
                continue
            indices += [[i, index[1]]]
            values += [value]
        dense_shape = [i + 1, pair.inp.denseShape[1]]

    if len(indices) == 0:
        indices = np.empty((0, 2), dtype=np.int64)
        values = np.array([], dtype=np.float64)

    return [indices, values, dense_shape]

class EuchreCoreMarkov(_EuchreCoreMarkov):
    def __init__(self, config, runner_name=None):
        _EuchreCoreMarkov.__init__(self, config)
        self.models = None
        self.data_names = None
        self.runner_name = runner_name or ''

    def set_models(self, raw_models):
        self.models = []
        self.data_names = []
        for raw_layers in raw_models:
            layers = []
            for raw_layer in raw_layers[2:]:
                layer = games.Layer(raw_layer[0])
                layer.M = raw_layer[1]
                layer.b = raw_layer[2]
                layers += [layer]
            model = getattr(self, raw_layers[0])
            model.layers = layers
            self.models += [model]
            self.data_names += [raw_layers[1]]

    def gather_data(self):
        inOuts = []
        for data_name in self.data_names:
            data = getattr(self, data_name)
            inOuts += [[
                data_to_in_tf_args(data),
                [pair.out for pair in data]
            ]]
        self.clearData()
        return inOuts

    def set_log_rule(self, log_rule_array):
        for shouldLog, player in zip(log_rule_array, self.players):
            player.shouldLog = shouldLog

    def set_greeds(self, greeds):
        for greed, player in zip(greeds, self.players):
            player.greed = greed

    def run(self, game_name, log=None, greeds=None, is_evaluation=False):
        log = log or ''
        greeds = greeds or [1.0] * core.config.N
        t0 = time.time()
        self.set_greeds(greeds)
        super(EuchreCoreMarkov, self).run(log)
        t1 = time.time()
        print(f'Game {game_name} done in {int(t1 - t0)} seconds by {self.runner_name}')
        if is_evaluation:
            self.clearData()
            return self.scores

    def ipdb(self):
        import ipdb; ipdb.set_trace()

def create_euchre_core_markov(name, **args):
    configCpp = EuchreConfig(*args['args_list'])
    core = EuchreCoreMarkov(configCpp, name)
    core.initialize()
    return core