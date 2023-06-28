import gc
import multiprocessing as mp
import numpy as np
import os
import pandas as pd
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import tensorflow as tf
import threading
import time

import games

from tools import hdf5

class NNModel:
    def __init__(self, name, nameCpp=None, dataNameCpp=None):
        self.name = name
        self.nn = None
        self.ins = []
        self.outs = []

        self.raw_layers = [nameCpp or f'{self.name}Cpp', dataNameCpp or f'{self.name[0]}Data']

        self.in_schema = None
        self.sparse_to_schema = None
        self.out_labels = None
        self.out_schema = None
        self.history = None

        self.evaluation_data_sparse = None

    def generate(self, d_in, ds, d_out, output_activation):
        layers = [tf.keras.layers.InputLayer(d_in)]
        for d in ds:
            layers += [tf.keras.layers.Dense(d, activation='relu')]
        layers += [tf.keras.layers.Dense(d_out, activation=output_activation)]
        
        self.nn = tf.keras.Sequential(layers)

        loss = tf.keras.losses.BinaryCrossentropy() if d_out == 1 else tf.keras.losses.CategoricalCrossentropy()
        # loss = tf.keras.losses.MeanSquaredError()
        self.nn.compile(
            optimizer='adam',
            loss=loss,
            metrics=['accuracy']
        )

        self.create_raw_layers()

    def load(self, model_dir):
        self.nn = tf.keras.models.load_model(f'{model_dir}/{self.name}')
        self.create_raw_layers()

    def create_raw_layers(self):
        self.raw_layers = self.raw_layers[:2]
        for layer in self.nn.layers:
            raw_layer = [
                layer.activation.__name__,
                layer.weights[0].numpy().T,
                layer.weights[1].numpy()
            ]
            self.raw_layers += [raw_layer]

    def load_schema(self, empty_in, out_labels, history_fname):
        # in_schema
        columns = []
        for feature in empty_in.features:
            labels = feature.labels()
            if isinstance(feature, games.FeatureOneHot):
                columns += [[feature.name, feature.name, 'one_hot', feature.d, '|'.join(labels)]]
            elif isinstance(feature, games.FeatureDense):
                for i, label in enumerate(labels):
                    columns += [[f'{feature.name}_{i}', feature.name, 'dense', 1, '|'.join(['', label])]]
        self.in_schema = pd.DataFrame(data=columns, columns=['column_name', 'feature_name', 'type', 'd', 'labels'])
        
        dfs = []
        for feature in empty_in.features:
            if isinstance(feature, games.FeatureOneHot):
                df = pd.DataFrame({'schema_index': 0, 'label_index': range(1, feature.d + 1)})
                df.iloc[0].schema_index = 1
            elif isinstance(feature, games.FeatureDense):
                df = pd.DataFrame({'schema_index': 1, 'label_index': 1}, index=range(feature.d))
            dfs += [df]
        self.sparse_to_schema = pd.concat(dfs).reset_index(drop=True)
        self.sparse_to_schema.schema_index = self.sparse_to_schema.schema_index.cumsum() - 1

        # out_schema
        columns = []
        for i, label in enumerate(out_labels):
            columns += [[f'{self.name}_out_{i}', f'{self.name}_out', 'dense', 1, '|'.join(['', label])]]
        self.out_schema = pd.DataFrame(data=columns, columns=['column_name', 'feature_name', 'type', 'd', 'labels'])

        if history_fname is not None:
            hdf5.write_table(self.in_schema, history_fname, f'data/{self.name}/in_schema', mode='w')
            hdf5.write_table(self.out_schema, history_fname, f'data/{self.name}/out_schema', mode='w')

    def save(self, model_dir):
        self.nn.save(f'{model_dir}/{self.name}')

    def write_history(self, history_fname):
        if self.history is None:
            return
        df = pd.DataFrame(self.history.history)
        hdf5.write_table(df, history_fname, f'fit/{self.name}', mode='a')

    def write_data(self, history_fname):
        in_data = pd.DataFrame(self.ins[-1].indices[self.ins[-1].values == 1])
        in_data = pd.concat([in_data, self.sparse_to_schema.loc[in_data[1]].reset_index(drop=True)], axis=1).set_index([0, 'schema_index']).label_index.unstack(1).fillna(0).astype(int)
        missing_columns = self.in_schema.index[~self.in_schema.index.isin(in_data.columns)]
        in_data[missing_columns] = 0
        hdf5.write_table(in_data, history_fname, f'data/{self.name}/in_data', mode='w')

        out_data = pd.DataFrame(np.array(self.outs[-1])).astype(int)
        hdf5.write_table(out_data, history_fname, f'data/{self.name}/out_data', mode='w')

    def take_data(self, ins, outs):
        self.ins += [ins]
        self.outs += [outs]

    def pop_data(self):
        self.ins.pop(0)
        self.outs.pop(0)

    def fit(self, epochs, batch_size):
        self.history = self.nn.fit(
            tf.sparse.concat(0, self.ins),
            np.array([vec for sub in self.outs for vec in sub]),
            epochs=epochs,
            batch_size=batch_size
        )
        self.create_raw_layers()

    def get_evaluation_data(self):
        return []

    def evaluate_data(self, history_fname):
        # get ins ready
        if self.evaluation_data_sparse is None:
            evaluation_data_dicts = self.get_evaluation_data()
            if len(evaluation_data_dicts) == 0:
                return

            def dict_to_data_row(d):
                row = pd.Series(index=self.in_schema.index, data=0)
                for k, v in d.items():
                    df = self.in_schema[self.in_schema.feature_name == k]
                    if isinstance(v, list):
                        hot = df[df.labels.str[1:].isin(v)]
                        row.loc[hot.index] = 1
                    else:
                        row.loc[df.index[0]] = df.iloc[0].labels.split('|').index(v)
                return row
            in_evaluation = pd.DataFrame(map(dict_to_data_row, evaluation_data_dicts))
            hdf5.write_table(in_evaluation, history_fname, f'data/{self.name}/in_evaluation', mode='w')
            
            offset = self.in_schema.d.shift().cumsum().fillna(0).astype(int)
            indices = []
            for i, row in in_evaluation.iterrows():
                indices += [[i, v] for v in (row - 1 + offset)[row != 0]]
            values = [1.0 for v in indices]
            dense_shape = [len(in_evaluation), self.in_schema.d.sum()]
            self.evaluation_data_sparse = tf.sparse.SparseTensor(indices, values, dense_shape)

        # evaluate
        out_evaluation = pd.DataFrame(self.nn(self.evaluation_data_sparse)).reset_index().rename(columns={'index': 'in_index'})
        hdf5.write_table(out_evaluation, history_fname, f'data/{self.name}/out_evaluation', mode='a')

class TNN(NNModel):
    def generate_initial(self, reference_core):
        self.generate(reference_core.emptyTIn.size(), [25], len(reference_core.tnnCpp.labels()), 'softmax')

class PNN(NNModel):
    def generate_initial(self, reference_core):
        self.generate(reference_core.emptyPIn.size(), [125], len(reference_core.pnnCpp.labels()), 'softmax')

class RNN(NNModel):
    def generate_initial(self, reference_core):
        self.generate(reference_core.emptyRIn.size(), [75], len(reference_core.rnnCpp.labels()), 'softmax')

    def get_evaluation_data(self):
        return [
            {
                'my_hand': ['JC', 'QC', 'KC', 'AC', 'JS'],
                'dealer': '3',
            },
            {
                'my_hand': ['JC', 'QC', 'KC', 'AC', 'JS'],
                'alone': '1',
                'dealer': '3',
            }
        ]

class WNN(NNModel):
    def generate_initial(self, reference_core):
        self.generate(reference_core.emptyWIn.size(), [], len(reference_core.wnnCpp.labels()), 'softmax')

        wp = reference_core.config.winningPoints
        n = reference_core.config.N // 2
        A = []
        for i in range(1, wp ** n):
            row = []
            x = i
            for j in range(n):
                row = [x % wp] + row
                x //= wp
            A += [row]
        self.nn.layers[0].weights[0].assign(np.array(A) * (1 / 3))
        self.nn.layers[0].weights[1].assign([0] * n)

    def fit(self, epochs, batch_size):
        return

class NNModels:
    def __init__(self):
        self.tnn = TNN('tnn')
        self.pnn = PNN('pnn')
        self.rnn = RNN('rnn')
        self.wnn = WNN('wnn')
        self.models = [self.tnn, self.pnn, self.rnn, self.wnn]
    
    def generate(self, reference_core):
        self.tnn.generate_initial(reference_core)
        self.pnn.generate_initial(reference_core)
        self.rnn.generate_initial(reference_core)
        self.wnn.generate_initial(reference_core)

    def load(self, model_dir):
        for model in self.models:
            model.load(model_dir)

    def load_schema(self, reference_core, history_fname):
        self.tnn.load_schema(reference_core.emptyTIn, reference_core.tnnCpp.labels(), history_fname)
        self.pnn.load_schema(reference_core.emptyPIn, reference_core.pnnCpp.labels(), history_fname)
        self.rnn.load_schema(reference_core.emptyRIn, reference_core.rnnCpp.labels(), history_fname)
        self.wnn.load_schema(reference_core.emptyWIn, reference_core.wnnCpp.labels(), history_fname)

    def get_raw_models(self):
        return [model.raw_layers for model in self.models]

    def take_data(self, inOutsList):
        for i, model in enumerate(self.models):
            # throw out tensors with no data
            ins = tf.sparse.concat(0, [tf.sparse.SparseTensor(*runner[i][0]) for runner in inOutsList if runner[i][0][2][1] != 0])
            outs = sum([runner[i][1] for runner in inOutsList], [])
            model.take_data(ins, outs)

    def pop_data(self):
        for model in self.models:
            model.pop_data()

    def fit(self, epochs, batch_size):
        for model in self.models:
            model.fit(epochs, batch_size)
        tf.keras.backend.clear_session()
        gc.collect()

    def save(self, model_dir):
        for model in self.models:
            model.save(model_dir)

    def write_history(self, history_fname):
        for model in self.models:
            model.write_history(history_fname)

    def write_data(self, history_fname):
        for model in self.models:
            model.write_data(history_fname)

    def evaluate_data(self, history_fname):
        for model in self.models:
            model.evaluate_data(history_fname)



# TODO ?
def tf_controller_target(connection):
    pass

class TFController:
    def __init__(self):
        self.connection, connection = mp.Pipe()
        self.process = mp.Process(target=tf_controller_target, args=(connection))

        def listener_loop():
            should_end = False
            print(f'tensorflow controller listener thread starting...')
            while not should_end:
                try:
                    msg = self.connection.recv()
                    self.handle_msg(msg)
                except Exception:
                    should_end = True
            print(f'tensorflow controller listener thread ending...')
        self.listener_thread = threading.Thread(target=listener_loop)

    def start(self):
        self.process.start()
        self.listener_thread.start()