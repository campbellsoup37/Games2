import numpy as np
import os
import tensorflow as tf
import time

from _hearts import HeartsConfig, HeartsCore
from _hearts import HeartsAiModuleMarkov as _HeartsAiModuleMarkov

hearts_dir = 'C:/Users/campb/data/hearts'

def sparse_vector_to_tf(vec):
    return tf.sparse.SparseTensor(vec.indices, vec.values, vec.denseShape)

class HeartsAiModuleMarkov(_HeartsAiModuleMarkov):
    def __init__(self, config, negative_score_tolerance, greed, log):
        _HeartsAiModuleMarkov.__init__(self, negative_score_tolerance, greed, log)
        self.pnn = None
        self.qnn = None

    def set_models(self, pnn, qnn):
        self.pnn = pnn
        self.qnn = qnn

    def pModel(self, vec):
        return self.pnn(sparse_vector_to_tf(vec)).numpy()[0]

    def qModel(self, vec):
        return self.qnn(sparse_vector_to_tf(vec)).numpy()[0]

class HeartsAiModuleMarkovCollection:
    def __init__(self, core, config, negative_score_tolerance, greed, load=True, log_rule=None, iter=None):
        self.config = config

        if iter is None:
            iter = 'base'
        self.iter = iter

        if log_rule is None:
            log_rule = lambda i: False

        self.modules = []
        for i in range(config.N):
            module = HeartsAiModuleMarkov(config, negative_score_tolerance, greed, log_rule(i))
            self.modules += [module]
            core.setModule(i, module)

        self.pnn = None
        self.qnn = None
        
        if load:
            try:
                self.pnn, self.qnn = self.load_models()
            except Exception:
                print('Models do not already exist. Generating...')

        if self.pnn is None and self.qnn is None:
            self.pnn = self.generate_model(self.modules[0].getPInSize(), [52], 52, 'softmax')
            self.qnn = self.generate_model(self.modules[0].getQInSize(), [30], 1, 'sigmoid')
        elif self.pnn is None or self.qnn is None:
            print('Failed to load pnn and qnn. Aborting...')
            exit(1)

        for module in self.modules:
            module.set_models(self.pnn, self.qnn)

        self.clear_data()

    def set_greed(self, greed):
        for module in self.modules:
            module.greed = greed

    @property
    def model_dir(self):
        return f'{hearts_dir}/{self.iter}/{self.config.N}/{int(self.config.oregon)}/models'

    def load_models(self):
        return tf.keras.models.load_model(f'{self.model_dir}/pnn'), tf.keras.models.load_model(f'{self.model_dir}/qnn')

    def save_models(self):
        os.makedirs(self.model_dir, exist_ok=True)

        self.pnn.save(f'{self.model_dir}/pnn')
        self.qnn.save(f'{self.model_dir}/qnn')

    def generate_model(self, d_in, ds, d_out, output_activation):
        layers = [tf.keras.layers.InputLayer(d_in)]
        for d in ds:
            layers += [tf.keras.layers.Dense(d, activation='relu')]
        layers += [tf.keras.layers.Dense(d_out, activation=output_activation)]
        
        nn = tf.keras.Sequential(layers)

        loss = tf.keras.losses.BinaryCrossentropy() if d_out == 1 else tf.keras.losses.CategoricalCrossentropy()
        # loss = tf.keras.losses.MeanSquaredError()
        nn.compile(
            optimizer='adam',
            loss=loss,
            metrics=['accuracy']
        )

        return nn

    def collect(self):
        for module in self.modules:
            self.pIns += [tf.sparse.reorder(sparse_vector_to_tf(pair.inp)) for pair in module.pPairs]
            self.pOuts += [pair.out for pair in module.pPairs]
            self.qIns += [tf.sparse.reorder(sparse_vector_to_tf(pair.inp)) for pair in module.qPairs]
            self.qOuts += [pair.out for pair in module.qPairs]

    def fit(self, epochs):
        self.pnn.fit(
            tf.sparse.concat(0, self.pIns),
            np.array(self.pOuts),
            epochs=epochs
        )
        self.qnn.fit(
            tf.sparse.concat(0, self.qIns),
            np.array(self.qOuts),
            epochs=epochs
        )

        self.clearData()

class HeartsAiModuleMarkovWorkshop:
    def __init__(self, N, oregon, negative_score_tolerance=-52, greed=1.0, log=False, log_rule=None, iter=None, max_rounds=0):
        if iter is None:
            iter = 'base'
        self.log = log
        self.iter = iter
        
        seed = int(time.time())
        self.config = HeartsConfig(N, oregon, max_rounds, seed)
        self.core = HeartsCore(self.config)

        self.moduleCollection = HeartsAiModuleMarkovCollection(self.core, self.config, negative_score_tolerance, greed, load=True, log_rule=log_rule, iter=iter)

    @property
    def log_dir(self):
        return f'{hearts_dir}/{self.iter}/{self.config.N}/{int(self.config.oregon)}/logs'

    def set_greed(self, greed):
        self.moduleCollection.set_greed(greed)

    def run(self, count=1, fit=True, games_per_fit=1, epochs_per_fit=1, greeds=None):
        if self.log:
            os.makedirs(self.log_dir, exist_ok=True)

        for f in range(count):
            greed = 1.0
            if greeds is not None:
                greed = greeds[f]
                self.set_greed(greed)
            print(f"Game group {f}: greed = {greed}")

            for g in range(games_per_fit):
                log = f'{self.log_dir}/run.{f}.{g}.txt' if self.log else ''
                t0 = time.time()
                self.core.run(log)
                t1 = time.time()
                print(f'Game {f}:{g} done in {int(t1 - t0)} seconds')
                self.moduleCollection.collect()

            if fit:
                self.moduleCollection.fit(epochs_per_fit)
                self.moduleCollection.save_models()
            else:
                self.moduleCollection.clear_data()