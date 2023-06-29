import os
import pandas as pd
import time

from _euchre import EuchreConfig
from euchre.cores.markov.core_markov import EuchreCoreMarkov
from euchre.cores.markov.local_runner import LocalRunner
from euchre.cores.markov.models import NNModels

from tools import hdf5

euchre_dir = 'C:/Users/campb/data/euchre'

class EuchreCoreMarkovWorkshop:
    def __init__(self, stickTheDealer=True, log_rule=None, iter=None, max_rounds=0, load=True):
        iter = iter or 'base'
        self.iter = iter
        self.load = load
        self.models = None
        
        seed = int(time.time())
        self.configArgs = [stickTheDealer, max_rounds, seed]
        self.config = EuchreConfig(*self.configArgs)
        
        self.log_rule = None
        if log_rule is not None:
            self.log_rule = [log_rule(i) for i in range(self.config.N)]

        self.runners = []
        self.ready_runners = set()

    def create_runner(self, write_schema):
        if self.models is None:
            self.create_models(write_schema)
            
        runner = LocalRunner(f'runner_{len(self.runners)}', self.configArgs, self)
        runner.start()

        if self.log_rule is not None:
            runner.set_log_rule(self.log_rule)

        runner.set_models(self.models)

        self.runners += [runner]
        self.ready_runners.add(runner)

    def create_models(self, write_schema):
        self.models = NNModels()
        dummy_core = EuchreCoreMarkov(self.config)
        dummy_core.initialize()
        if self.load:
            self.models.load(self.model_dir)
        else:
            self.models.generate(dummy_core)
        self.models.load_schema(dummy_core, self.history_fname if write_schema else None)

    @property
    def base_dir(self):
        return f'{euchre_dir}/{self.iter}/{int(self.config.stickTheDealer)}'

    @property
    def log_dir(self):
        return f'{self.base_dir}/logs'

    @property
    def model_dir(self):
        return f'{self.base_dir}/models'

    @property
    def history_fname(self):
        return f'{self.base_dir}/history.h5'

    def run_one_game(self, name, log=None, greeds=None, max_running=1, is_evaluation=False, write_schema=False):
        while len(self.ready_runners) == 0:
            if len(self.runners) < max_running:
                self.create_runner(write_schema)
            else:
                time.sleep(0.001)

        runner = self.ready_runners.pop()
        runner.run(name, log, greeds, is_evaluation)

    def wait_for_runners(self):
        while len(self.ready_runners) != len(self.runners):
            time.sleep(0.001)

    def run(
        self, 
        group_count=1, 
        game_log=False,
        fit=True, 
        group_size=1, 
        epochs_per_fit=1, 
        group_fit_window=1, 
        groups_per_evaluation=0, 
        evaluation_size=1, 
        evaluation_log=False,
        groups_per_save_data=0, 
        groups_per_evaluation_data=0, 
        batch_size=None, 
        greeds=None, 
        save=False, 
        num_processes=1
    ):
        if game_log or evaluation_log:
            os.makedirs(self.log_dir, exist_ok=True)

        write_schema = groups_per_save_data > 0 or groups_per_evaluation_data > 0

        for f in range(group_count):
            # Set greeds
            greed = greeds[f] if greeds is not None else 1.0
            group_greeds = [greed] * self.config.N

            # Play games
            print(f"Game group {f}: greed = {greed}")
            for g in range(group_size):
                name = f'{f}.{g}'
                log = None
                if game_log:
                    log = f'{self.log_dir}/game.{name}.txt'
                self.run_one_game(name, log, group_greeds, num_processes, False, write_schema)
            self.wait_for_runners()

            # Gather data
            save_data = groups_per_save_data > 0 and (f + 1) % groups_per_save_data == 0
            if fit or save_data:
                print('Gathering data...')
                for runner in self.runners:
                    self.ready_runners.remove(runner)
                    runner.gather_data()
                self.wait_for_runners()
                self.models.take_data([runner.inOuts for runner in self.runners])
                if save_data:
                    print('Writing data...')
                    self.models.write_data(self.history_fname)
            else:
                for runner in self.runners:
                    self.ready_runners.remove(runner)
                    runner.clear_data()
                self.wait_for_runners()

            # Fit models
            if fit:
                if f >= group_fit_window - 1:
                    self.models.fit(epochs_per_fit, batch_size)
                    if save:
                        self.models.save(self.model_dir)
                        self.models.write_history(self.history_fname)
                    self.models.pop_data()
                    # Update runners' models
                    for runner in self.runners:
                        runner.set_models(self.models)
                    self.wait_for_runners()

            # Evaluate
            if groups_per_evaluation > 0 and (f + 1) % groups_per_evaluation == 0:
                print('Evaluation:')
                scores = pd.DataFrame(columns=['index', 'rotation', 'team', 'score']).set_index(['index', 'rotation', 'team']).score
                num_rotations = self.config.N // 2
                for rotation in range(num_rotations):
                    rotated_greeds = [1.0 if i % num_rotations == rotation else 0.0 for i in range(self.config.N)]
                    for h in range(evaluation_size):
                        name = f'{f}.{rotation}.{h}'
                        log = None
                        if evaluation_log:
                            log = f'{self.log_dir}/evaluation.{name}.txt'
                        self.run_one_game(name, log, rotated_greeds, num_processes, True, write_schema)
                    self.wait_for_runners()
                    all_scores = []
                    for runner in self.runners:
                        all_scores += runner.scores
                        runner.scores = []
                    for h, runner_scores in enumerate(all_scores):
                        for team, score in enumerate(runner_scores):
                            scores.loc[h, rotation, team] = score
                scores = scores.reset_index()
                scores['rotated_team'] = (scores.team + num_rotations - scores.rotation) % num_rotations
                scores = scores.set_index(['rotation', 'index', 'rotated_team']).score.unstack(2)
                scores.columns = [f'score_{i}' for i in scores]
                scores['win'] = scores.score_0.eq(scores.max(axis=1)).astype(int)
                scores = scores.unstack(0).describe().T
                print(scores)
                scores = scores.stack()
                scores.index = ['_'.join(map(str, i)) for i in scores.index]
                scores = scores.to_frame().T

                if save:
                    hdf5.write_table(scores, self.history_fname, 'evaluation', mode='a')

            # Evaluation data
            if save and groups_per_evaluation_data > 0 and (f + 1) % groups_per_evaluation_data == 0:
                print('Evaluating data...')
                self.models.evaluate_data(self.history_fname)

        for runner in self.runners:
            runner.end()