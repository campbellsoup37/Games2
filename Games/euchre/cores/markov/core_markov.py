import numpy as np

from _euchre import EuchreCoreMarkov as _EuchreCoreMarkov
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
    def __init__(self, config):
        _EuchreCoreMarkov.__init__(self, config)
        self.models = None
        self.data_names = None

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

    def ipdb(self):
        import ipdb; ipdb.set_trace()